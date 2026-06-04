/**
 * Tests for src/lib/sala/g6/router-adapter.ts · Escalón 4 G6 LIVE wire.
 *
 * Verifies the adapter that maps the router's BudgetCheckInput shape
 * to the G6 BudgetHook contract + back. Mock hook · no live Supabase
 * calls in CI.
 *
 * Coverage ·
 * - Bucket key built per canon · t:{tenant}:c:{client}:j:{journey}:o:{op}
 * - hook.checkAndIncrement called with bucket_key + projected_cost_usd
 * - hook ok=true → router allowed=true + budget_key echo
 * - hook ok=false → router allowed=false + reason echo
 * - reason fallback · 'bucket-exhausted' when hook omits it
 * - projected_cost_usd flows through (undefined OK)
 * - Hook override (input.hook) takes precedence over factory
 */
import { describe, it, expect, vi } from 'vitest'
import { createG6RouterBudgetCheck } from '../src/lib/sala/g6/router-adapter'
import type { BudgetHook } from '../src/lib/sala/budget-hook'
import type { BudgetCheckInput } from '../src/lib/sala-router/types'
import type { JourneyType } from '../src/lib/sala/libretos/types'

function fakeInput(
  overrides: Partial<BudgetCheckInput> = {},
): BudgetCheckInput {
  const tenant_id = overrides.tenant_id ?? 'zero-risk'
  const client_id = overrides.client_id ?? 'perez'
  const journey_type = overrides.journey_type ?? ('ONBOARD' as JourneyType)
  const operation_type = overrides.operation_type ?? 'onboard.brand-strategist'
  const step_id = overrides.step_id ?? 'brand_strategist'
  const bucket_key =
    overrides.bucket_key ??
    `t:${tenant_id}:c:${client_id}:j:${journey_type}:o:${operation_type}`
  return {
    tenant_id,
    client_id,
    journey_type,
    operation_type,
    step_id,
    bucket_key,
    ...(overrides.projected_cost_usd !== undefined
      ? { projected_cost_usd: overrides.projected_cost_usd }
      : {}),
  }
}

function stubHook(
  impl: BudgetHook['checkAndIncrement'],
): BudgetHook & { calls: Array<[string, number | undefined]> } {
  const calls: Array<[string, number | undefined]> = []
  const hook: BudgetHook = {
    async checkAndIncrement(bucketKey: string, cost?: number) {
      calls.push([bucketKey, cost])
      return impl(bucketKey, cost)
    },
  }
  return Object.assign(hook, { calls })
}

describe('createG6RouterBudgetCheck · adapter behavior', () => {
  it('builds the canonical bucket key per t:c:j:o convention', async () => {
    const hook = stubHook(async (bucketKey) => ({ ok: true, bucketKey }))
    const check = createG6RouterBudgetCheck({ hook })
    await check(
      fakeInput({
        tenant_id: 'zero-risk',
        client_id: 'perez',
        journey_type: 'PRODUCE' as JourneyType,
        operation_type: 'PRODUCE.campaign-brief-agent',
      }),
    )
    expect(hook.calls).toHaveLength(1)
    expect(hook.calls[0]![0]).toBe(
      't:zero-risk:c:perez:j:PRODUCE:o:PRODUCE.campaign-brief-agent',
    )
  })

  it('passes projected_cost_usd through to the hook', async () => {
    const hook = stubHook(async (bucketKey) => ({ ok: true, bucketKey }))
    const check = createG6RouterBudgetCheck({ hook })
    await check(fakeInput({ projected_cost_usd: 0.42 }))
    expect(hook.calls[0]![1]).toBe(0.42)
  })

  it('omits cost when projected_cost_usd is undefined', async () => {
    const hook = stubHook(async (bucketKey) => ({ ok: true, bucketKey }))
    const check = createG6RouterBudgetCheck({ hook })
    await check(fakeInput())
    expect(hook.calls[0]![1]).toBeUndefined()
  })

  it('maps hook ok=true → router allowed=true + bucket key echo', async () => {
    const hook = stubHook(async (bucketKey) => ({
      ok: true,
      bucketKey,
      remainingCostUsd: 99,
      remainingSteps: 50,
    }))
    const check = createG6RouterBudgetCheck({ hook })
    const out = await check(fakeInput())
    expect(out.allowed).toBe(true)
    expect(out.budget_key).toBe('t:zero-risk:c:perez:j:ONBOARD:o:onboard.brand-strategist')
    expect(out.reason).toBeUndefined()
  })

  it('maps hook ok=false → router allowed=false + reason', async () => {
    const hook = stubHook(async (bucketKey) => ({
      ok: false,
      bucketKey,
      reason: 'bucket-exhausted',
      remainingCostUsd: 0,
      remainingSteps: 0,
    }))
    const check = createG6RouterBudgetCheck({ hook })
    const out = await check(fakeInput())
    expect(out.allowed).toBe(false)
    expect(out.reason).toBe('bucket-exhausted')
    expect(out.budget_key).toBe('t:zero-risk:c:perez:j:ONBOARD:o:onboard.brand-strategist')
  })

  it('falls back to "bucket-exhausted" reason when hook omits one', async () => {
    const hook = stubHook(async (bucketKey) => ({ ok: false, bucketKey }))
    const check = createG6RouterBudgetCheck({ hook })
    const out = await check(fakeInput())
    expect(out.allowed).toBe(false)
    expect(out.reason).toBe('bucket-exhausted')
  })

  it('echoes hook.reason verbatim when provided', async () => {
    const hook = stubHook(async (bucketKey) => ({
      ok: false,
      bucketKey,
      reason: 'rpc-error: connection refused',
    }))
    const check = createG6RouterBudgetCheck({ hook })
    const out = await check(fakeInput())
    expect(out.reason).toBe('rpc-error: connection refused')
  })

  it('different journey/op produces different bucket keys', async () => {
    const hook = stubHook(async (bucketKey) => ({ ok: true, bucketKey }))
    const check = createG6RouterBudgetCheck({ hook })
    await check(fakeInput({ operation_type: 'A' }))
    await check(fakeInput({ operation_type: 'B' }))
    expect(hook.calls[0]![0]).not.toBe(hook.calls[1]![0])
    expect(hook.calls[0]![0]).toMatch(/:o:A$/)
    expect(hook.calls[1]![0]).toMatch(/:o:B$/)
  })

  it('explicit input.hook takes precedence (factory not used)', async () => {
    const hookFn = vi.fn(async (bucketKey: string) => ({
      ok: true,
      bucketKey,
    }))
    const check = createG6RouterBudgetCheck({
      hook: { checkAndIncrement: hookFn },
      // Even with enabled+supabase set, the explicit hook wins.
      enabled: true,
      supabase: undefined,
    })
    const out = await check(fakeInput())
    expect(out.allowed).toBe(true)
    expect(hookFn).toHaveBeenCalledOnce()
  })

  it('default factory yields noop (allowed=true) when env disabled', async () => {
    const prev = process.env.SALA_G6_HOOK_ENABLED
    delete process.env.SALA_G6_HOOK_ENABLED
    try {
      const check = createG6RouterBudgetCheck() // no hook, no supabase
      const out = await check(fakeInput())
      expect(out.allowed).toBe(true)
      expect(out.budget_key).toBe('t:zero-risk:c:perez:j:ONBOARD:o:onboard.brand-strategist')
    } finally {
      if (prev !== undefined) process.env.SALA_G6_HOOK_ENABLED = prev
    }
  })
})
