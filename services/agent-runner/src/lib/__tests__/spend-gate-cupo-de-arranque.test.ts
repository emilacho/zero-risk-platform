/**
 * El cupo de arranque en la tercera puerta (agent-runner · Railway) · espejo de `__tests__/run-sdk-spend-gate-cupo-de-arranque.test.ts` (CC#2 · 20-oct · opción A firmada por Emilio).
 * Ficha `onboarding` en sus primeros 7 días ⇒ techo de 24 h = el mayor entre el general (8) y RUN_ONBOARDING_CAP_USD (13). Falla hacia lo normal. La ficha solo BAJA.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkSpendCap, techoDeArranque } from '../spend-gate.js'

const AHORA = Date.parse('2026-10-20T12:00:00Z')
const haceDias = (d: number) => new Date(AHORA - d * 86_400_000).toISOString()
const CLIENTE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
function supabaseWith(gasto: number[], ficha: { data: unknown; error: unknown }) {
  return {
    from: (tabla: string) => ({
      select: () => ({
        eq: () => {
          const r = tabla === 'clients' ? ficha : { data: gasto.map((c) => ({ cost_usd: c })), error: null }
          return Object.assign(Promise.resolve(r), { gte: async () => ({ data: gasto.map((c) => ({ cost_usd: c })), error: null }) })
        },
      }),
    }),
  } as never
}
const fichaDe = (status: unknown, created_at: unknown, config: unknown = {}) => ({ data: [{ config, status, created_at }], error: null })
const VARS = ['RUN_SPEND_CAP_USD', 'RUN_ONBOARDING_CAP_USD', 'RUN_ONBOARDING_DIAS', 'RUN_SPEND_CAP_ENFORCE']
beforeEach(() => { for (const v of VARS) delete process.env[v] })
afterEach(() => { for (const v of VARS) delete process.env[v] })

describe('agent-runner · techoDeArranque (puro, idéntico al de la plataforma)', () => {
  const t = (status: unknown, createdAt: unknown, generico = 8) => techoDeArranque({ status, createdAt, nowMs: AHORA, generico })
  it('onboarding dentro de 7 días ⇒ 13; fuera, otro estado, sin fecha o fecha futura ⇒ el general', () => {
    expect(t('onboarding', haceDias(1))).toEqual({ cap: 13, arranque: true })
    expect(t('onboarding', haceDias(8))).toEqual({ cap: 8, arranque: false })
    for (const s of ['active', 'churned', null, undefined, 'Onboarding']) expect(t(s, haceDias(1)), String(s)).toEqual({ cap: 8, arranque: false })
    for (const c of [null, '', 'ayer', haceDias(-1)]) expect(t('onboarding', c), String(c)).toEqual({ cap: 8, arranque: false })
  })
  it('nunca baja del general y las variables mandan (ilegibles ⇒ 13 y 7)', () => {
    expect(t('onboarding', haceDias(1), 20)).toEqual({ cap: 20, arranque: false })
    process.env.RUN_ONBOARDING_CAP_USD = '10'; process.env.RUN_ONBOARDING_DIAS = '2'
    expect(t('onboarding', haceDias(1))).toEqual({ cap: 10, arranque: true }); expect(t('onboarding', haceDias(3))).toEqual({ cap: 8, arranque: false })
    process.env.RUN_ONBOARDING_CAP_USD = 'mucho'; process.env.RUN_ONBOARDING_DIAS = '-1'
    expect(t('onboarding', haceDias(1))).toEqual({ cap: 13, arranque: true })
  })
})

describe('agent-runner · checkSpendCap con el cupo de arranque', () => {
  it('cliente onboarding de ayer con US$ 9 gastados PASA y lo dice; con 13 se frena', async () => {
    expect(await checkSpendCap(supabaseWith([5, 4], fichaDe('onboarding', haceDias(1))), CLIENTE, AHORA)).toMatchObject({ blocked: false, cupo_de_arranque: true })
    expect(await checkSpendCap(supabaseWith([6.5, 6.5], fichaDe('onboarding', haceDias(1))), CLIENTE, AHORA)).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: 13, cupo_de_arranque: true })
  })
  it('el mismo cliente `active`, o uno viejo en onboarding, se frena en 8', async () => {
    expect(await checkSpendCap(supabaseWith([5, 4], fichaDe('active', haceDias(1))), CLIENTE, AHORA)).toMatchObject({ blocked: true, cap_usd: 8 })
    expect(await checkSpendCap(supabaseWith([9], fichaDe('onboarding', haceDias(30))), CLIENTE, AHORA)).toMatchObject({ blocked: true, cap_usd: 8 })
  })
  it('la ficha solo BAJA: tope 6 rige 6 (y no se marca arranque); tope 50 se ignora', async () => {
    const r = await checkSpendCap(supabaseWith([7], fichaDe('onboarding', haceDias(1), { spend_cap_usd: 6 })), CLIENTE, AHORA)
    expect(r).toMatchObject({ blocked: true, cap_usd: 6, cap_ficha_usd: 6 }); expect(r).not.toHaveProperty('cupo_de_arranque')
    expect(await checkSpendCap(supabaseWith([12], fichaDe('onboarding', haceDias(1), { spend_cap_usd: 50 })), CLIENTE, AHORA)).toMatchObject({ blocked: false })
  })
  it('FALLA HACIA LO NORMAL: ficha con error, vacía, sin estado o sin fecha ⇒ 8', async () => {
    for (const f of [{ data: null, error: { message: 'x' } }, { data: [], error: null }, fichaDe(undefined, haceDias(1)), fichaDe('onboarding', undefined)])
      expect(await checkSpendCap(supabaseWith([9], f), CLIENTE, AHORA)).toMatchObject({ blocked: true, cap_usd: 8 })
  })
})
