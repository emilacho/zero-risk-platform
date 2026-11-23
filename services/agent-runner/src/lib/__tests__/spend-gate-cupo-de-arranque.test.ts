/**
 * El cupo de arranque en la tercera puerta (agent-runner · Railway) · espejo de `__tests__/run-sdk-spend-gate-cupo-de-arranque.test.ts` (CC#2 · 20-oct · opción A firmada por Emilio).
 * Ficha `onboarding` en sus primeros 7 días ⇒ techo de 24 h = el mayor entre el general y RUN_ONBOARDING_CAP_USD. Falla hacia lo normal. La ficha MANDA (sube o baja, desde el 30-oct).
 * 18-nov (3 × lo medido): el general y el cupo por omisión quedaron los dos en 24,05 → 60 (21-nov · A1: 24,05 → 60, firma de Emilio), así que con los valores por omisión el cupo no suma nada; el mecanismo se prueba con un cupo configurado más alto.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkSpendCap, resolveCapUsd, resolveOnboardingCapUsd, techoDeArranque } from '../spend-gate.js'

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
/** el general por omisión (sin variables): 24,05 desde el 18-nov, 60 desde el 21-nov */
const GENERAL = 60

describe('agent-runner · techoDeArranque (puro, idéntico al de la plataforma)', () => {
  // el general se pasa como argumento: aquí uno MÁS BAJO que el cupo (8, el de antes del 18-nov) para ver el mecanismo
  const t = (status: unknown, createdAt: unknown, generico = 8) => techoDeArranque({ status, createdAt, nowMs: AHORA, generico })
  it('el cupo por omisión es 60 (13 → 3 × lo medido, 18-nov → 60, 21-nov), igual al general: con los valores por omisión no suma ni marca arranque', () => {
    expect(resolveOnboardingCapUsd()).toBe(60)
    expect(resolveCapUsd()).toBe(GENERAL)
    expect(t('onboarding', haceDias(1), GENERAL)).toEqual({ cap: GENERAL, arranque: false })
  })
  it('onboarding dentro de 7 días ⇒ el cupo (60); fuera, otro estado, sin fecha o fecha futura ⇒ el general', () => {
    expect(t('onboarding', haceDias(1))).toEqual({ cap: 60, arranque: true })
    expect(t('onboarding', haceDias(8))).toEqual({ cap: 8, arranque: false })
    for (const s of ['active', 'churned', null, undefined, 'Onboarding']) expect(t(s, haceDias(1)), String(s)).toEqual({ cap: 8, arranque: false })
    for (const c of [null, '', 'ayer', haceDias(-1)]) expect(t('onboarding', c), String(c)).toEqual({ cap: 8, arranque: false })
  })
  it('nunca baja del general y las variables mandan (ilegibles ⇒ 60 y 7)', () => {
    expect(t('onboarding', haceDias(1), 70)).toEqual({ cap: 70, arranque: false })
    process.env.RUN_ONBOARDING_CAP_USD = '10'; process.env.RUN_ONBOARDING_DIAS = '2'
    expect(t('onboarding', haceDias(1))).toEqual({ cap: 10, arranque: true }); expect(t('onboarding', haceDias(3))).toEqual({ cap: 8, arranque: false })
    process.env.RUN_ONBOARDING_CAP_USD = 'mucho'; process.env.RUN_ONBOARDING_DIAS = '-1'
    expect(t('onboarding', haceDias(1))).toEqual({ cap: 60, arranque: true })
  })
})

describe('agent-runner · checkSpendCap con el cupo de arranque', () => {
  it('18-nov · con los valores por omisión un cliente onboarding de ayer se frena en el general (60) y no se marca arranque', async () => {
    const r = await checkSpendCap(supabaseWith([30, 30], fichaDe('onboarding', haceDias(1))), CLIENTE, AHORA)
    expect(r).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: GENERAL }); expect(r).not.toHaveProperty('cupo_de_arranque')
    expect(await checkSpendCap(supabaseWith([30, 29.99], fichaDe('onboarding', haceDias(1))), CLIENTE, AHORA)).toMatchObject({ blocked: false })
  })
  // el MECANISMO, con un cupo configurado por encima del general (RUN_ONBOARDING_CAP_USD = 70)
  describe('con el cupo configurado por encima del general (70 > 60)', () => {
    beforeEach(() => { process.env.RUN_ONBOARDING_CAP_USD = '70' })
    it('cliente onboarding de ayer con US$ 65 gastados PASA y lo dice; con 70 se frena', async () => {
      expect(await checkSpendCap(supabaseWith([32.5, 32.5], fichaDe('onboarding', haceDias(1))), CLIENTE, AHORA)).toMatchObject({ blocked: false, cupo_de_arranque: true })
      expect(await checkSpendCap(supabaseWith([35, 35], fichaDe('onboarding', haceDias(1))), CLIENTE, AHORA)).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: 70, cupo_de_arranque: true })
    })
    it('el mismo cliente `active`, o uno viejo en onboarding, se frena en el general (60)', async () => {
      expect(await checkSpendCap(supabaseWith([32.5, 32.5], fichaDe('active', haceDias(1))), CLIENTE, AHORA)).toMatchObject({ blocked: true, cap_usd: GENERAL })
      expect(await checkSpendCap(supabaseWith([65], fichaDe('onboarding', haceDias(30))), CLIENTE, AHORA)).toMatchObject({ blocked: true, cap_usd: GENERAL })
    })
    it('FALLA HACIA LO NORMAL: ficha con error, vacía, sin estado o sin fecha ⇒ el general (60), nunca el cupo (70)', async () => {
      for (const f of [{ data: null, error: { message: 'x' } }, { data: [], error: null }, fichaDe(undefined, haceDias(1)), fichaDe('onboarding', undefined)])
        expect(await checkSpendCap(supabaseWith([65], f), CLIENTE, AHORA)).toMatchObject({ blocked: true, cap_usd: GENERAL })
    })
  })
  it('la ficha MANDA: tope 6 rige 6 (y no se marca arranque); tope 80 rige 80 (sube)', async () => {
    const r = await checkSpendCap(supabaseWith([7], fichaDe('onboarding', haceDias(1), { spend_cap_usd: 6 })), CLIENTE, AHORA)
    expect(r).toMatchObject({ blocked: true, cap_usd: 6, cap_ficha_usd: 6 }); expect(r).not.toHaveProperty('cupo_de_arranque')
    expect(await checkSpendCap(supabaseWith([70], fichaDe('onboarding', haceDias(1), { spend_cap_usd: 80 })), CLIENTE, AHORA)).toMatchObject({ blocked: false })
    expect(await checkSpendCap(supabaseWith([19], fichaDe('active', haceDias(40), { spend_cap_usd: 20 })), CLIENTE, AHORA)).toMatchObject({ blocked: false })
    expect(await checkSpendCap(supabaseWith([20], fichaDe('active', haceDias(40), { spend_cap_usd: 20 })), CLIENTE, AHORA)).toMatchObject({ blocked: true, cap_usd: 20, cap_ficha_usd: 20 })
  })
})
