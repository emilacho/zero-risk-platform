/**
 * Tests · §150 spend gate (agent-runner native /run-sdk · checkSpendCap).
 *
 * Covers the deepest door: direct n8n→Railway callers (JOURNEY B · smoke).
 * Cases mirror the Vercel run-sdk-spend-gate suite.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkSpendCap, resolveNaufragoCapUsd } from '../spend-gate.js'

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

function supabaseWith(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: async () => result,
        }),
      }),
    }),
  } as never
}

beforeEach(() => {
  delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
  delete process.env.SALA_NAUFRAGO_CAP_USD
})
afterEach(() => {
  delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
  delete process.env.SALA_NAUFRAGO_CAP_USD
})

describe('agent-runner §150 spend gate', () => {
  it('flag OFF → never blocks (shadow)', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 999 }], error: null })
    expect((await checkSpendCap(sb, NAUFRAGO)).reason).toBe('flag_off')
  })

  it('enforce ON · non-Náufrago → pass (other_tenant)', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({ data: [{ cost_usd: 999 }], error: null })
    expect((await checkSpendCap(sb, 'other-uuid')).reason).toBe('other_tenant')
  })

  it('enforce ON · Náufrago · over cap ($5 default) → BLOCK', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({ data: [{ cost_usd: 4 }, { cost_usd: 2 }], error: null })
    const r = await checkSpendCap(sb, NAUFRAGO)
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('over_cap')
    expect(r.cap_usd).toBe(5)
    expect(r.spent_usd).toBeCloseTo(6)
  })

  it('enforce ON · Náufrago · cap raised to $30 → under cap PASS', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    process.env.SALA_NAUFRAGO_CAP_USD = '30'
    const sb = supabaseWith({ data: [{ cost_usd: 14.05 }], error: null })
    const r = await checkSpendCap(sb, NAUFRAGO)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('under_cap')
  })

  it('enforce ON · query error → NOT blocked (§148 safety-net)', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({ data: null, error: { message: 'boom' } })
    expect((await checkSpendCap(sb, NAUFRAGO)).reason).toBe('query_error')
  })

  it('enforce ON · no client → pass', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({ data: [], error: null })
    expect((await checkSpendCap(sb, null)).reason).toBe('no_client')
  })

  it('resolveNaufragoCapUsd · env override + invalid fallback', () => {
    expect(resolveNaufragoCapUsd()).toBe(5)
    process.env.SALA_NAUFRAGO_CAP_USD = '30'
    expect(resolveNaufragoCapUsd()).toBe(30)
    process.env.SALA_NAUFRAGO_CAP_USD = 'nope'
    expect(resolveNaufragoCapUsd()).toBe(5)
  })
})
