/**
 * Tests · §150 spend gate (agent-runner native /run-sdk · checkSpendCap) · por cliente, sin cliente nombrado.
 *
 * Covers the deepest door: direct n8n→Railway callers (JOURNEY B · smoke).
 * Cases mirror the Vercel run-sdk-spend-gate suite.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { capDeLaFicha, checkSpendCap, isCapEnforced, resolveCapUsd } from '../spend-gate.js'

const CLIENTE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

/** gasto = filas de agent_invocations · ficha = filas de clients (config) */
function supabaseWith(gasto: { data: unknown; error: unknown }, ficha: { data: unknown; error: unknown } = { data: [{ config: {} }], error: null }) {
  return {
    from: (tabla: string) => ({
      select: () => ({
        eq: () => {
          const r = tabla === 'clients' ? ficha : gasto
          return Object.assign(Promise.resolve(r), { gte: async () => gasto })
        },
      }),
    }),
  } as never
}

beforeEach(() => {
  delete process.env.RUN_SPEND_CAP_ENFORCE
  delete process.env.RUN_SPEND_CAP_USD
})
afterEach(() => {
  delete process.env.RUN_SPEND_CAP_ENFORCE
  delete process.env.RUN_SPEND_CAP_USD
})

describe('agent-runner §150 spend gate', () => {
  it('interruptor explícito RUN_SPEND_CAP_ENFORCE=false → nunca bloquea', async () => {
    process.env.RUN_SPEND_CAP_ENFORCE = 'false'
    const sb = supabaseWith({ data: [{ cost_usd: 999 }], error: null })
    expect((await checkSpendCap(sb, CLIENTE)).reason).toBe('flag_off')
  })

  it('encendido por omisión · aplica a CUALQUIER cliente · sobre el techo general ($8) → BLOCK', async () => {
    expect(isCapEnforced()).toBe(true)
    const sb = supabaseWith({ data: [{ cost_usd: 5 }, { cost_usd: 4 }], error: null })
    const r = await checkSpendCap(sb, 'otro-uuid')
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('over_cap')
    expect(r.cap_usd).toBe(8)
    expect(r.spent_usd).toBeCloseTo(9)
  })

  it('el techo de la ficha BAJA el general: ficha 6 bloquea a 7, aunque el general sea 8', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 7 }], error: null }, { data: [{ config: { spend_cap_usd: 6 } }], error: null })
    const r = await checkSpendCap(sb, CLIENTE)
    expect(r).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: 6, cap_ficha_usd: 6 })
  })

  it('la ficha MANDA (30-oct): ficha 50, gasto 9 → pasa con el 50; con gasto 50 bloquea', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 9 }], error: null }, { data: [{ config: { spend_cap_usd: 50 } }], error: null })
    expect(await checkSpendCap(sb, CLIENTE)).toMatchObject({ blocked: false })
    const sb2 = supabaseWith({ data: [{ cost_usd: 50 }], error: null }, { data: [{ config: { spend_cap_usd: 50 } }], error: null })
    expect(await checkSpendCap(sb2, CLIENTE)).toMatchObject({ blocked: true, cap_usd: 50 })
  })

  it('bajo el techo → pasa', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 1.5 }], error: null }, { data: [{ config: { spend_cap_usd: 6 } }], error: null })
    const r = await checkSpendCap(sb, CLIENTE)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('under_cap')
  })

  it('RUN_SPEND_CAP_USD=30 sube el general → pasa con 14', async () => {
    process.env.RUN_SPEND_CAP_USD = '30'
    const sb = supabaseWith({ data: [{ cost_usd: 14.05 }], error: null })
    expect((await checkSpendCap(sb, CLIENTE)).reason).toBe('under_cap')
  })

  it('fallo al leer el gasto → NO bloquea (§148)', async () => {
    const sb = supabaseWith({ data: null, error: { message: 'boom' } })
    expect((await checkSpendCap(sb, CLIENTE)).reason).toBe('query_error')
  })

  it('fallo al leer la ficha → rige el general, sin bloquear por la caída', async () => {
    const sb = supabaseWith({ data: [{ cost_usd: 1 }], error: null }, { data: null, error: { message: 'boom' } })
    expect((await checkSpendCap(sb, CLIENTE)).reason).toBe('under_cap')
  })

  it('sin cliente → pasa', async () => {
    const sb = supabaseWith({ data: [], error: null })
    expect((await checkSpendCap(sb, null)).reason).toBe('no_client')
  })

  it('resolveCapUsd · variable + basura vuelve al general', () => {
    expect(resolveCapUsd()).toBe(8)
    process.env.RUN_SPEND_CAP_USD = '30'
    expect(resolveCapUsd()).toBe(30)
    for (const malo of ['nope', '0', '-2']) { process.env.RUN_SPEND_CAP_USD = malo; expect(resolveCapUsd()).toBe(8) }
  })

  it('capDeLaFicha · número > 0 vale; lo demás es null', () => {
    expect(capDeLaFicha({ spend_cap_usd: 6 })).toBe(6)
    expect(capDeLaFicha({ spend_cap_usd: '6' })).toBe(6)
    for (const malo of [{ spend_cap_usd: 0 }, {}, null, 'x', []]) expect(capDeLaFicha(malo)).toBeNull()
  })
})
