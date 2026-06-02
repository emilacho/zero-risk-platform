/**
 * Tests for src/lib/sala/executors/inngest-executor.ts · Sprint 12 Fase 0 ·
 * InngestExecutor skeleton.
 *
 * What is verified (skeleton scope) ·
 * - Implements the SalaExecutor contract (structural compile-time check
 *   via TypeScript + runtime method presence)
 * - register · stores handlers, rejects invalid input
 * - enqueue · requires precomputed idempotencyKey · throws without
 * - enqueue · deduplicates same idempotencyKey (OUR-layer dedup)
 * - enqueue · mints distinct runIds for distinct keys
 * - getStatus · returns 'queued' for fresh runs
 * - getStatus · throws for unknown runIds
 * - cancel · transitions to 'cancelled' · idempotent on terminal states
 * - Budget hook · is invoked when a budget policy is registered
 * - Budget hook · BudgetExhaustedError when ok=false
 * - Budget hook · no-budget operations short-circuit safely
 *
 * Out of skeleton scope (NOT tested here, will be tested when wired) ·
 * - real Inngest SDK behaviour (proven by RESULTS-CC3-inngest-runtime-verify.md)
 * - real G6 RPC (`rate_limit_buckets.increment_bucket_atomic`)
 * - durable crash-recovery (Inngest property · spike-confirmed)
 */
import { describe, it, expect, vi } from 'vitest'
import { InngestExecutor } from '../src/lib/sala/executors/inngest-executor'
import {
  BudgetExhaustedError,
  noopBudgetHook,
  type BudgetHook,
} from '../src/lib/sala/budget-hook'
import { deriveIdempotencyKey } from '../src/lib/sala/idempotency-key'
import type {
  ExecutionInput,
  LogicalPeriod,
  SalaExecutor,
  StepRunner,
} from '../src/lib/sala/executor-contract'

// ─── Helpers ─────────────────────────────────────────────────────────

const DEFAULT_PERIOD: LogicalPeriod = { kind: 'iso_week', value: '2026-W23' }

function buildInput<T = unknown>(overrides?: Partial<ExecutionInput<T>>): ExecutionInput<T> {
  const base = {
    operationType: 'campaign.create_brief',
    clientId: 'client-abc',
    logicalPeriod: DEFAULT_PERIOD,
    payload: { foo: 'bar' } as unknown as T,
  }
  const merged = { ...base, ...overrides }
  return {
    ...merged,
    idempotencyKey: deriveIdempotencyKey({
      operationType: merged.operationType,
      clientId: merged.clientId,
      logicalPeriod: merged.logicalPeriod,
    }),
  }
}

const noopFn = async (_input: unknown, _step: StepRunner) => 'ok'

const defaultRetry = { maxAttempts: 3, initialBackoffMs: 1000, maxBackoffMs: 30_000 }

// ─── Contract conformance ──────────────────────────────────────────

describe('InngestExecutor · SalaExecutor conformance', () => {
  it('is assignable to SalaExecutor (compile-time + runtime shape)', () => {
    const exec: SalaExecutor = new InngestExecutor()
    expect(typeof exec.register).toBe('function')
    expect(typeof exec.enqueue).toBe('function')
    expect(typeof exec.getStatus).toBe('function')
    expect(typeof exec.cancel).toBe('function')
  })
})

// ─── register ───────────────────────────────────────────────────────

describe('InngestExecutor.register', () => {
  it('stores a handler against the operationType', () => {
    const exec = new InngestExecutor()
    exec.register('campaign.create_brief', noopFn, { retry: defaultRetry })
    const got = exec.getRegisteredHandler('campaign.create_brief')
    expect(got).toBeDefined()
    expect(got?.operationType).toBe('campaign.create_brief')
    expect(got?.retry.maxAttempts).toBe(3)
    expect(got?.budget).toBeUndefined()
  })

  it('stores a budget policy alongside the handler', () => {
    const exec = new InngestExecutor()
    exec.register('campaign.publish', noopFn, {
      retry: defaultRetry,
      budget: { bucketKey: 'campaign:publish:client-abc', maxCostPerRunUsd: 5 },
    })
    const got = exec.getRegisteredHandler('campaign.publish')
    expect(got?.budget?.bucketKey).toBe('campaign:publish:client-abc')
    expect(got?.budget?.maxCostPerRunUsd).toBe(5)
  })

  it('last-write-wins for the same operationType', () => {
    const exec = new InngestExecutor()
    exec.register('campaign.create_brief', noopFn, { retry: defaultRetry })
    const fn2 = async (_input: unknown, _step: StepRunner) => 'replaced'
    exec.register('campaign.create_brief', fn2, { retry: defaultRetry })
    const got = exec.getRegisteredHandler('campaign.create_brief')
    expect(got?.fn).toBe(fn2)
  })

  it('rejects empty operationType', () => {
    const exec = new InngestExecutor()
    expect(() =>
      exec.register('', noopFn, { retry: defaultRetry }),
    ).toThrow(/operationType/i)
    expect(() =>
      exec.register('   ', noopFn, { retry: defaultRetry }),
    ).toThrow(/operationType/i)
  })

  it('rejects retry.maxAttempts < 1', () => {
    const exec = new InngestExecutor()
    expect(() =>
      exec.register('x', noopFn, {
        retry: { maxAttempts: 0, initialBackoffMs: 1, maxBackoffMs: 1 },
      }),
    ).toThrow(/maxAttempts/)
  })
})

// ─── enqueue ────────────────────────────────────────────────────────

describe('InngestExecutor.enqueue', () => {
  it('mints a fresh runId for a never-seen idempotencyKey', async () => {
    const exec = new InngestExecutor()
    exec.register('campaign.create_brief', noopFn, { retry: defaultRetry })
    const runId = await exec.enqueue(buildInput())
    expect(typeof runId).toBe('string')
    expect((runId as string).startsWith('run-')).toBe(true)
  })

  it('dedups · same idempotencyKey returns the same runId', async () => {
    const exec = new InngestExecutor()
    exec.register('campaign.create_brief', noopFn, { retry: defaultRetry })
    const input = buildInput()
    const a = await exec.enqueue(input)
    const b = await exec.enqueue(input)
    expect(a).toBe(b)
  })

  it('different idempotencyKeys produce different runIds', async () => {
    const exec = new InngestExecutor()
    exec.register('campaign.create_brief', noopFn, { retry: defaultRetry })
    const a = await exec.enqueue(buildInput({ clientId: 'client-1' }))
    const b = await exec.enqueue(buildInput({ clientId: 'client-2' }))
    expect(a).not.toBe(b)
  })

  it('throws when no handler is registered', async () => {
    const exec = new InngestExecutor()
    await expect(exec.enqueue(buildInput())).rejects.toThrow(/no handler/)
  })

  it('throws when idempotencyKey is missing (type system also rejects · this is the runtime guard)', async () => {
    const exec = new InngestExecutor()
    exec.register('campaign.create_brief', noopFn, { retry: defaultRetry })
    const badInput = {
      operationType: 'campaign.create_brief',
      clientId: 'client-abc',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' } as LogicalPeriod,
      payload: {},
      // idempotencyKey deliberately omitted · cast to satisfy compiler in this guard test
    } as unknown as ExecutionInput
    await expect(exec.enqueue(badInput)).rejects.toThrow(/idempotencyKey/)
  })

  it('after a run is cancelled, re-enqueue with the same key mints a new runId', async () => {
    const exec = new InngestExecutor()
    exec.register('campaign.create_brief', noopFn, { retry: defaultRetry })
    const input = buildInput()
    const runId1 = await exec.enqueue(input)
    await exec.cancel(runId1)
    const runId2 = await exec.enqueue(input)
    expect(runId2).not.toBe(runId1)
  })
})

// ─── getStatus + cancel ─────────────────────────────────────────────

describe('InngestExecutor.getStatus + cancel', () => {
  it('newly enqueued run is in "queued" status', async () => {
    const exec = new InngestExecutor()
    exec.register('x', noopFn, { retry: defaultRetry })
    const runId = await exec.enqueue(buildInput({ operationType: 'x' }))
    expect(await exec.getStatus(runId)).toBe('queued')
  })

  it('cancel transitions to "cancelled" status', async () => {
    const exec = new InngestExecutor()
    exec.register('x', noopFn, { retry: defaultRetry })
    const runId = await exec.enqueue(buildInput({ operationType: 'x' }))
    await exec.cancel(runId)
    expect(await exec.getStatus(runId)).toBe('cancelled')
  })

  it('cancel is idempotent on terminal states (completed)', async () => {
    const exec = new InngestExecutor()
    exec.register('x', noopFn, { retry: defaultRetry })
    const runId = await exec.enqueue(buildInput({ operationType: 'x' }))
    exec.markCompleted(runId)
    expect(await exec.getStatus(runId)).toBe('completed')
    await exec.cancel(runId)
    expect(await exec.getStatus(runId)).toBe('completed')
  })

  it('cancel of unknown runId is a no-op (per contract idempotency)', async () => {
    const exec = new InngestExecutor()
    await expect(
      exec.cancel('unknown-runid' as unknown as never),
    ).resolves.toBeUndefined()
  })

  it('getStatus throws on unknown runId', async () => {
    const exec = new InngestExecutor()
    await expect(
      exec.getStatus('unknown-runid' as unknown as never),
    ).rejects.toThrow(/unknown runId/)
  })
})

// ─── Budget hook (Opus §H-d · 5th pecado · CAP) ────────────────────

describe('InngestExecutor budget hook', () => {
  it('default noopBudgetHook always returns ok=true', async () => {
    const result = await noopBudgetHook.checkAndIncrement('any-bucket')
    expect(result.ok).toBe(true)
  })

  it('checkBudgetForOperation short-circuits when no budget is registered', async () => {
    const exec = new InngestExecutor()
    exec.register('campaign.create_brief', noopFn, { retry: defaultRetry })
    const result = await exec.checkBudgetForOperation('campaign.create_brief')
    expect(result.ok).toBe(true)
    expect(result.bucketKey).toBe('(no-budget-policy)')
  })

  it('checkBudgetForOperation calls the hook when budget is registered', async () => {
    const spy = vi.fn(async (bucketKey: string) => ({
      ok: true,
      bucketKey,
      remainingCostUsd: 4.5,
    }))
    const hook: BudgetHook = { checkAndIncrement: spy }
    const exec = new InngestExecutor({ budgetHook: hook })
    exec.register('campaign.publish', noopFn, {
      retry: defaultRetry,
      budget: { bucketKey: 'campaign:publish:abc', maxCostPerRunUsd: 5 },
    })
    const result = await exec.checkBudgetForOperation('campaign.publish', 0.5)
    expect(spy).toHaveBeenCalledWith('campaign:publish:abc', 0.5)
    expect(result.ok).toBe(true)
    expect(result.remainingCostUsd).toBe(4.5)
  })

  it('checkBudgetForOperation throws BudgetExhaustedError when hook returns ok=false', async () => {
    const hook: BudgetHook = {
      async checkAndIncrement(bucketKey: string) {
        return {
          ok: false,
          bucketKey,
          reason: 'daily aggregate $100 exhausted',
        }
      },
    }
    const exec = new InngestExecutor({ budgetHook: hook })
    exec.register('campaign.publish', noopFn, {
      retry: defaultRetry,
      budget: { bucketKey: 'campaign:publish:abc' },
    })
    await expect(
      exec.checkBudgetForOperation('campaign.publish'),
    ).rejects.toThrow(BudgetExhaustedError)
  })

  it('BudgetExhaustedError carries bucketKey + reason for forensics', async () => {
    const hook: BudgetHook = {
      async checkAndIncrement(bucketKey: string) {
        return { ok: false, bucketKey, reason: 'hourly burst $5 exhausted' }
      },
    }
    const exec = new InngestExecutor({ budgetHook: hook })
    exec.register('x', noopFn, {
      retry: defaultRetry,
      budget: { bucketKey: 'x:bucket' },
    })
    let caught: unknown
    try {
      await exec.checkBudgetForOperation('x')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BudgetExhaustedError)
    expect((caught as BudgetExhaustedError).bucketKey).toBe('x:bucket')
    expect((caught as BudgetExhaustedError).reason).toBe(
      'hourly burst $5 exhausted',
    )
  })
})
