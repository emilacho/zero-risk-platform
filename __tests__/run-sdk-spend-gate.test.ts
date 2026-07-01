/**
 * Tests for the §150 run-sdk spend gate (checkRunSdkSpendCap).
 *
 * Mocks the Supabase query chain. The cap value + tenant set + enforce flag
 * come from the real §150 canon module (sala-journey-dispatch), so these
 * tests also lock the integration with that canon.
 *
 * Cases:
 *   1. flag OFF (shadow) → never blocks
 *   2. enforce ON · non-Náufrago tenant → pass (other_tenant)
 *   3. enforce ON · Náufrago · spend >= cap → BLOCK
 *   4. enforce ON · Náufrago · spend < cap → pass (under_cap)
 *   5. enforce ON · Náufrago · query error → NOT blocked (§148 safety-net)
 *   6. enforce ON · no client_id → pass (no_client)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkRunSdkSpendCap } from '../src/lib/run-sdk-spend-gate'
import { NAUFRAGO_TENANT_ID_UUID, NAUFRAGO_PHASE1_RUN_CAP_USD } from '../src/lib/sala-journey-dispatch'

function supabaseWith(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue(result),
  }
  return { from: vi.fn(() => chain) } as never
}

beforeEach(() => {
  delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
  delete process.env.SALA_NAUFRAGO_CAP_USD
})
afterEach(() => {
  delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
  delete process.env.SALA_NAUFRAGO_CAP_USD
  vi.restoreAllMocks()
})

describe('§150 run-sdk spend gate', () => {
  it('1 · flag OFF → never blocks (shadow)', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 999 }], error: null })
    const r = await checkRunSdkSpendCap(sb, NAUFRAGO_TENANT_ID_UUID)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('flag_off')
  })

  it('2 · enforce ON · non-Náufrago → pass (other_tenant)', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({ data: [{ cost_usd: 999 }], error: null })
    const r = await checkRunSdkSpendCap(sb, 'some-other-client-uuid')
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('other_tenant')
  })

  it('3 · enforce ON · Náufrago · over cap → BLOCK', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({
      data: [{ cost_usd: 4.0 }, { cost_usd: 2.5 }], // 6.5 >= 5
      error: null,
    })
    const r = await checkRunSdkSpendCap(sb, NAUFRAGO_TENANT_ID_UUID)
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('over_cap')
    expect(r.cap_usd).toBe(NAUFRAGO_PHASE1_RUN_CAP_USD)
    expect(r.spent_usd).toBeCloseTo(6.5)
  })

  it('4 · enforce ON · Náufrago · under cap → pass', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({ data: [{ cost_usd: 1.2 }], error: null })
    const r = await checkRunSdkSpendCap(sb, NAUFRAGO_TENANT_ID_UUID)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('under_cap')
    expect(r.spent_usd).toBeCloseTo(1.2)
  })

  it('5 · enforce ON · query error → NOT blocked (§148 safety-net)', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({ data: null, error: { message: 'boom' } })
    const r = await checkRunSdkSpendCap(sb, NAUFRAGO_TENANT_ID_UUID)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('query_error')
  })

  it('6 · enforce ON · no client → pass', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    const sb = supabaseWith({ data: [], error: null })
    const r = await checkRunSdkSpendCap(sb, null)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('no_client')
  })

  it('7 · FIX · SALA_NAUFRAGO_CAP_USD override · sube el cap · spend bajo el env cap → pass', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    process.env.SALA_NAUFRAGO_CAP_USD = '10'
    const sb = supabaseWith({ data: [{ cost_usd: 6.5 }], error: null }) // 6.5 >= 5 (hardcode) pero < 10 (env)
    const r = await checkRunSdkSpendCap(sb, NAUFRAGO_TENANT_ID_UUID)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('under_cap')
  })

  it('8 · FIX · SALA_NAUFRAGO_CAP_USD override · bloquea con el cap del env (no el hardcode)', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    process.env.SALA_NAUFRAGO_CAP_USD = '10'
    const sb = supabaseWith({ data: [{ cost_usd: 12 }], error: null }) // 12 >= 10 (env cap)
    const r = await checkRunSdkSpendCap(sb, NAUFRAGO_TENANT_ID_UUID)
    expect(r.blocked).toBe(true)
    expect(r.cap_usd).toBe(10) // el cap del env · NO el hardcode 5.0
  })

  it('9 · FIX · env inválido/vacío → fallback al hardcode $5', async () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    process.env.SALA_NAUFRAGO_CAP_USD = 'abc'
    const sb = supabaseWith({ data: [{ cost_usd: 6 }], error: null }) // 6 >= 5 hardcode
    const r = await checkRunSdkSpendCap(sb, NAUFRAGO_TENANT_ID_UUID)
    expect(r.blocked).toBe(true)
    expect(r.cap_usd).toBe(NAUFRAGO_PHASE1_RUN_CAP_USD)
  })
})
