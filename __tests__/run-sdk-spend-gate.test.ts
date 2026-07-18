/**
 * Tests · §150 run-sdk spend gate GENÉRICO (checkRunSdkSpendCap).
 *
 * Re-plan go-live paso (c) · ruling consejero 2026-07-18:
 *   (1) cap por el cliente/tenant DE LA CORRIDA · sin UUIDs hardcodeados
 *   (2) enforce ON por default (deja de ser default-OFF)
 *   (3) techo run-scoped ~$8 configurable (env `RUN_SPEND_CAP_USD`)
 * Mockea la cadena de query de Supabase. $0 · sin corridas · sin modelo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkRunSdkSpendCap,
  isRunSpendCapEnforced,
  resolveRunSpendCapUsd,
  DEFAULT_RUN_SPEND_CAP_USD,
} from '../src/lib/run-sdk-spend-gate'
import { NAUFRAGO_TENANT_ID_UUID } from '../src/lib/sala-journey-dispatch'

function supabaseWith(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue(result),
  }
  return { from: vi.fn(() => chain) } as never
}

beforeEach(() => {
  delete process.env.RUN_SPEND_CAP_ENFORCE
  delete process.env.RUN_SPEND_CAP_USD
})
afterEach(() => {
  delete process.env.RUN_SPEND_CAP_ENFORCE
  delete process.env.RUN_SPEND_CAP_USD
  vi.restoreAllMocks()
})

describe('§150 run-sdk spend gate · GENÉRICO', () => {
  it('1 · enforce ON POR DEFAULT (sin env) · over cap $8 → BLOCK', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 5 }, { cost_usd: 4 }], error: null }) // 9 >= 8
    const r = await checkRunSdkSpendCap(sb, 'any-client-uuid')
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('over_cap')
    expect(r.cap_usd).toBe(DEFAULT_RUN_SPEND_CAP_USD)
    expect(r.spent_usd).toBeCloseTo(9)
  })

  it('2 · enforce ON por default · under cap → pass (under_cap)', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 2.5 }], error: null }) // 2.5 < 8
    const r = await checkRunSdkSpendCap(sb, 'any-client-uuid')
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('under_cap')
    expect(r.cap_usd).toBe(8)
    expect(r.spent_usd).toBeCloseTo(2.5)
  })

  it('3 · kill-switch RUN_SPEND_CAP_ENFORCE=false → NUNCA bloquea (aunque over cap)', async () => {
    process.env.RUN_SPEND_CAP_ENFORCE = 'false'
    const sb = supabaseWith({ data: [{ cost_usd: 999 }], error: null })
    const r = await checkRunSdkSpendCap(sb, 'any-client-uuid')
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('disabled')
  })

  it('4 · GENÉRICO · aplica a CUALQUIER tenant (no sólo Náufrago) → bloquea a un cliente arbitrario', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 8.01 }], error: null })
    const r = await checkRunSdkSpendCap(sb, 'peniche-or-any-future-client')
    expect(r.blocked).toBe(true) // el agujero latente cerrado: NO hay other_tenant que se salve
    expect(r.reason).toBe('over_cap')
  })

  it('5 · GENÉRICO · Náufrago también cae bajo el techo $8 (sin special-casing · más estricto que $25)', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 10 }], error: null }) // 10 >= 8
    const r = await checkRunSdkSpendCap(sb, NAUFRAGO_TENANT_ID_UUID)
    expect(r.blocked).toBe(true)
    expect(r.cap_usd).toBe(8) // el genérico $8 · no $25 ni $5
  })

  it('6 · frontera exacta · spent == cap → BLOCK · spent apenas debajo → pass', async () => {
    const atCap = await checkRunSdkSpendCap(supabaseWith({ data: [{ cost_usd: 8 }], error: null }), 'c')
    expect(atCap.blocked).toBe(true)
    const under = await checkRunSdkSpendCap(supabaseWith({ data: [{ cost_usd: 7.99 }], error: null }), 'c')
    expect(under.blocked).toBe(false)
  })

  it('7 · techo TUNABLE por env RUN_SPEND_CAP_USD', async () => {
    process.env.RUN_SPEND_CAP_USD = '3'
    const sb = supabaseWith({ data: [{ cost_usd: 3.5 }], error: null }) // 3.5 >= 3 (env) pero < 8 (default)
    const r = await checkRunSdkSpendCap(sb, 'c')
    expect(r.blocked).toBe(true)
    expect(r.cap_usd).toBe(3)
  })

  it('8 · cost_usd como string se coerce a número', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: '6.0' }, { cost_usd: '2.5' }], error: null }) // 8.5 >= 8
    const r = await checkRunSdkSpendCap(sb, 'c')
    expect(r.blocked).toBe(true)
    expect(r.spent_usd).toBeCloseTo(8.5)
  })

  it('9 · no client_id → pass (no_client)', async () => {
    const r = await checkRunSdkSpendCap(supabaseWith({ data: [], error: null }), null)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('no_client')
  })

  it('10 · query error → NOT blocked (§148 safety-net)', async () => {
    const sb = supabaseWith({ data: null, error: { message: 'boom' } })
    const r = await checkRunSdkSpendCap(sb, 'c')
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('query_error')
  })
})

describe('isRunSpendCapEnforced · default ON · kill-switch explícito', () => {
  beforeEach(() => delete process.env.RUN_SPEND_CAP_ENFORCE)
  afterEach(() => delete process.env.RUN_SPEND_CAP_ENFORCE)

  it('env ausente → ON', () => {
    expect(isRunSpendCapEnforced()).toBe(true)
  })
  it("'false' / '0' / 'off' / 'no' → OFF", () => {
    for (const v of ['false', '0', 'off', 'no', 'FALSE', ' Off ']) {
      process.env.RUN_SPEND_CAP_ENFORCE = v
      expect(isRunSpendCapEnforced()).toBe(false)
    }
  })
  it("'true' / cualquier otro valor → ON", () => {
    for (const v of ['true', '1', 'on', 'yes', 'whatever']) {
      process.env.RUN_SPEND_CAP_ENFORCE = v
      expect(isRunSpendCapEnforced()).toBe(true)
    }
  })
})

describe('resolveRunSpendCapUsd · default $8 · env override · valida', () => {
  beforeEach(() => delete process.env.RUN_SPEND_CAP_USD)
  afterEach(() => delete process.env.RUN_SPEND_CAP_USD)

  it('default = 8.0', () => {
    expect(resolveRunSpendCapUsd()).toBe(8.0)
    expect(DEFAULT_RUN_SPEND_CAP_USD).toBe(8.0)
  })
  it('env válido sobreescribe', () => {
    process.env.RUN_SPEND_CAP_USD = '12.5'
    expect(resolveRunSpendCapUsd()).toBe(12.5)
  })
  it('env inválido / no-positivo → default', () => {
    for (const v of ['abc', '0', '-5', '']) {
      process.env.RUN_SPEND_CAP_USD = v
      expect(resolveRunSpendCapUsd()).toBe(8.0)
    }
  })
})
