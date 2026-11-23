/**
 * Tests · §150 run-sdk spend gate GENÉRICO (checkRunSdkSpendCap).
 *
 * Re-plan go-live paso (c) · ruling consejero 2026-07-18:
 *   (1) cap por el cliente/tenant DE LA CORRIDA · sin UUIDs hardcodeados
 *   (2) enforce ON por default (deja de ser default-OFF)
 *   (3) techo run-scoped configurable (env `RUN_SPEND_CAP_USD`) · era ~$8; desde el 18-nov US$ 24,05 (3 × lo medido, firma de Emilio) → 60 (21-nov · A1: 24,05 → 60, firma de Emilio)
 * Mockea la cadena de query de Supabase. $0 · sin corridas · sin modelo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkRunSdkSpendCap,
  isRunSpendCapEnforced,
  resolveRunSpendCapUsd,
  DEFAULT_RUN_SPEND_CAP_USD,
  DEFAULT_SYSTEM_SPEND_CAP_USD,
} from '../src/lib/run-sdk-spend-gate'
const CLIENTE_DE_PRUEBA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

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
  it('1 · enforce ON POR DEFAULT (sin env) · over cap $60 → BLOCK', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 35 }, { cost_usd: 30 }], error: null }) // 65 >= 60
    const r = await checkRunSdkSpendCap(sb, 'any-client-uuid')
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('over_cap')
    expect(r.cap_usd).toBe(DEFAULT_RUN_SPEND_CAP_USD)
    expect(r.spent_usd).toBeCloseTo(65)
  })

  it('2 · enforce ON por default · under cap → pass (under_cap)', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 2.5 }], error: null }) // 2.5 < 60
    const r = await checkRunSdkSpendCap(sb, 'any-client-uuid')
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('under_cap')
    expect(r.cap_usd).toBe(DEFAULT_RUN_SPEND_CAP_USD)
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
    const sb = supabaseWith({ data: [{ cost_usd: 60.01 }], error: null })
    const r = await checkRunSdkSpendCap(sb, 'peniche-or-any-future-client')
    expect(r.blocked).toBe(true) // el agujero latente cerrado: NO hay other_tenant que se salve
    expect(r.reason).toBe('over_cap')
  })

  it('5 · GENÉRICO · Náufrago también cae bajo el techo $60 (sin special-casing · no el $25 viejo)', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 65 }], error: null }) // 65 >= 60
    const r = await checkRunSdkSpendCap(sb, CLIENTE_DE_PRUEBA)
    expect(r.blocked).toBe(true)
    expect(r.cap_usd).toBe(DEFAULT_RUN_SPEND_CAP_USD) // el genérico $60 · no $25 ni la vara por corrida
    expect(r.cap_usd).toBe(60)
  })

  it('6 · frontera exacta · spent == cap → BLOCK · spent apenas debajo → pass', async () => {
    const atCap = await checkRunSdkSpendCap(supabaseWith({ data: [{ cost_usd: 60 }], error: null }), 'c')
    expect(atCap.blocked).toBe(true)
    const under = await checkRunSdkSpendCap(supabaseWith({ data: [{ cost_usd: 59.99 }], error: null }), 'c')
    expect(under.blocked).toBe(false)
  })

  it('7 · techo TUNABLE por env RUN_SPEND_CAP_USD', async () => {
    process.env.RUN_SPEND_CAP_USD = '3'
    const sb = supabaseWith({ data: [{ cost_usd: 3.5 }], error: null }) // 3.5 >= 3 (env) pero < 60 (default)
    const r = await checkRunSdkSpendCap(sb, 'c')
    expect(r.blocked).toBe(true)
    expect(r.cap_usd).toBe(3)
  })

  it('8 · cost_usd como string se coerce a número', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: '40.0' }, { cost_usd: '20.5' }], error: null }) // 60.5 >= 60
    const r = await checkRunSdkSpendCap(sb, 'c')
    expect(r.blocked).toBe(true)
    expect(r.spent_usd).toBeCloseTo(60.5)
  })

  /**
   * CONTRATO ACTUALIZADO · agujero A · plan 2026-08-15 · firmado por Emilio 2026-08-23.
   *
   * Antes esta prueba fijaba `reason:'no_client'`, que significaba **sin techo**:
   * cualquier corrida paga sin cliente pasaba libre. Eso ERA el agujero — y no es
   * teórico: el 10-ago `brand-strategist` corrió sin cliente y gastó $0,6147
   * (medición CC#3 2026-08-22).
   *
   * Ahora cae en el cubo `system`, con techo propio ($2; desde el 18-nov $11,93 · `RUN_SPEND_CAP_SYSTEM_USD`)
   * y avisando. NO se bloquea a secas, porque un `client_id` nulo es legítimo para
   * llamadas de sistema: el caso queda VISIBLE, no bloqueado a ciegas.
   */
  it('9 · sin client_id → NO pasa libre · se mide contra el cubo system', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [{ cost_usd: 0.6147 }], error: null }),
    }
    const sb = { from: vi.fn(() => chain) } as never
    const r = await checkRunSdkSpendCap(sb, null, { notify: async () => ({ dispatched: true }) })
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('system_under_cap')
    expect(r.cap_usd).toBe(DEFAULT_SYSTEM_SPEND_CAP_USD)
    expect(r.spent_usd).toBeCloseTo(0.6147, 4)
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

describe('resolveRunSpendCapUsd · default $60 · env override · valida', () => {
  beforeEach(() => delete process.env.RUN_SPEND_CAP_USD)
  afterEach(() => delete process.env.RUN_SPEND_CAP_USD)

  it('default = 60 ($8 → 3 × lo medido, 18-nov → 60, 21-nov)', () => {
    expect(resolveRunSpendCapUsd()).toBe(60)
    expect(DEFAULT_RUN_SPEND_CAP_USD).toBe(60)
  })
  it('env válido sobreescribe', () => {
    process.env.RUN_SPEND_CAP_USD = '12.5'
    expect(resolveRunSpendCapUsd()).toBe(12.5)
  })
  it('env inválido / no-positivo → default', () => {
    for (const v of ['abc', '0', '-5', '']) {
      process.env.RUN_SPEND_CAP_USD = v
      expect(resolveRunSpendCapUsd()).toBe(DEFAULT_RUN_SPEND_CAP_USD)
    }
  })
})
