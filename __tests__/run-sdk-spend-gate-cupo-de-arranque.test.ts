/**
 * EL CUPO DE ARRANQUE (CC#2 · 20-oct · opción A firmada por Emilio 15:15). US$ 0 · sin base ni modelo.
 * Un cliente `onboarding` en sus primeros días tiene techo de 24 h = el MAYOR entre el general (8) y RUN_ONBOARDING_CAP_USD (13); al pasar a `active` vuelve a 8.
 * No cambia: la vara por corrida (5), que la ficha MANDA (sube o baja, desde el 30-oct), el kill-switch, y que sin dato de la ficha rige lo normal (falla hacia lo normal, nunca hacia lo alto).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkRunSdkSpendCap, resolveClientCapContext, techoGenericoDeArranque, DEFAULT_ONBOARDING_SPEND_CAP_USD, DEFAULT_ONBOARDING_DAYS } from '../src/lib/run-sdk-spend-gate'

const AHORA = Date.parse('2026-10-20T12:00:00Z')
const haceDias = (d: number) => new Date(AHORA - d * 86_400_000).toISOString()
type Fila = { cost_usd: number; workflow_execution_id: string }
function sb(o: { status?: unknown; created_at?: unknown; config?: unknown; fichaError?: boolean; sinFicha?: boolean; libro: Fila[] }) {
  return {
    from(tabla: string) {
      if (tabla === 'clients') {
        const ficha = o.fichaError ? { data: null, error: { message: 'fallo' } } : o.sinFicha ? { data: null, error: null } : { data: { config: o.config ?? {}, status: o.status, created_at: o.created_at }, error: null }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ficha }), or: async () => ({ data: [{ id: 'c1' }], error: null }) }) }
      }
      const q = { select: () => q, eq: () => q, in: () => q, gte: async () => ({ data: o.libro, error: null }) }
      return q
    },
  } as never
}
const gasto = (...v: number[]): Fila[] => v.map((x, i) => ({ cost_usd: x, workflow_execution_id: 'e' + i }))
const GATE = (s: never, run = 'corrida-nueva') => checkRunSdkSpendCap(s, 'c1', { runId: run, nowMs: AHORA, notify: (async () => ({ ok: true })) as never })
const VARS = ['RUN_SPEND_CAP_USD', 'RUN_ONBOARDING_CAP_USD', 'RUN_ONBOARDING_DIAS', 'RUN_SPEND_CAP_ENFORCE']
beforeEach(() => { for (const v of VARS) delete process.env[v] })
afterEach(() => { for (const v of VARS) delete process.env[v] })

describe('techoGenericoDeArranque (puro)', () => {
  const t = (status: unknown, createdAt: unknown, generico = 8) => techoGenericoDeArranque({ status, createdAt, nowMs: AHORA, generico })
  it('onboarding y dentro de sus primeros días ⇒ 13; los valores por omisión son 13 y 7 días', () => {
    expect(DEFAULT_ONBOARDING_SPEND_CAP_USD).toBe(13); expect(DEFAULT_ONBOARDING_DAYS).toBe(7)
    expect(t('onboarding', haceDias(0.1))).toEqual({ cap: 13, arranque: true }); expect(t('onboarding', haceDias(6.9))).toEqual({ cap: 13, arranque: true })
  })
  it('pasados los 7 días, o en cualquier otro estado, rige el general (active, churned, paused, null, otro tipo)', () => {
    expect(t('onboarding', haceDias(7.1))).toEqual({ cap: 8, arranque: false })
    for (const s of ['active', 'churned', 'paused', 'Onboarding', ' onboarding', null, undefined, 7, {}]) expect(t(s, haceDias(1)), String(s)).toEqual({ cap: 8, arranque: false })
  })
  it('sin fecha legible, con fecha futura o ilegible: rige el general (nunca el alto por duda)', () => {
    for (const c of [null, undefined, '', 'ayer', 12345, haceDias(-2)]) expect(t('onboarding', c), String(c)).toEqual({ cap: 8, arranque: false })
  })
  it('nunca BAJA del general: con el general en 20 y el cupo en 13 rige 20 y no se marca arranque', () => {
    expect(t('onboarding', haceDias(1), 20)).toEqual({ cap: 20, arranque: false })
  })
  it('las variables mandan: cupo y días se leen del entorno; valores ilegibles vuelven a 13 y 7', () => {
    process.env.RUN_ONBOARDING_CAP_USD = '10'; process.env.RUN_ONBOARDING_DIAS = '2'
    expect(t('onboarding', haceDias(1))).toEqual({ cap: 10, arranque: true }); expect(t('onboarding', haceDias(3))).toEqual({ cap: 8, arranque: false })
    for (const raro of ['', 'mucho', '0', '-5', 'NaN']) { process.env.RUN_ONBOARDING_CAP_USD = raro; process.env.RUN_ONBOARDING_DIAS = raro; expect(t('onboarding', haceDias(1)), raro).toEqual({ cap: 13, arranque: true }) }
  })
})

describe('el freno de run-sdk con el cupo de arranque', () => {
  it('cliente onboarding de ayer: con US$ 9 gastados PASA (antes se frenaba a 8), y lo dice', async () => {
    const r = await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(5, 4) }))
    expect(r).toMatchObject({ blocked: false, cap_usd: 13, cupo_de_arranque: true, cap_generico_usd: 8 })
  })
  it('y se frena en 13: con US$ 13 gastados ya no se lanza la llamada', async () => {
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(6.5, 6.5) }))).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: 13 })
    expect((await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(6.5, 6.4) }))).blocked).toBe(false)
  })
  it('el mismo cliente `active` vuelve a 8: con US$ 9 se frena', async () => {
    const r = await GATE(sb({ status: 'active', created_at: haceDias(1), libro: gasto(5, 4) }))
    expect(r).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: 8 }); expect(r).not.toHaveProperty('cupo_de_arranque')
  })
  it('un cliente olvidado en onboarding hace un mes NO conserva el techo alto (Náufrago, por ejemplo)', async () => {
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(30), libro: gasto(9) }))).toMatchObject({ blocked: true, cap_usd: 8 })
  })
  it('la vara por corrida de US$ 5 NO cambia: una sola corrida que llega a 5 se corta aunque el cupo sea 13', async () => {
    const libro = [{ cost_usd: 5, workflow_execution_id: 'corrida-nueva' }]
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro }))).toMatchObject({ blocked: true, reason: 'run_over_cap', run_cap_usd: 5 })
  })
  it('la ficha MANDA: tope 6 en un cliente onboarding rige 6; tope 50 rige 50 (sube)', async () => {
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), config: { spend_cap_usd: 6 }, libro: gasto(7) }))).toMatchObject({ blocked: true, cap_usd: 6, cap_override_usd: 6 })
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), config: { spend_cap_usd: 50 }, libro: gasto(12) }))).toMatchObject({ blocked: false, cap_usd: 50, cap_override_usd: 50 })
    expect(await GATE(sb({ status: 'active', created_at: haceDias(40), config: { spend_cap_usd: 20 }, libro: gasto(19) }))).toMatchObject({ blocked: false, cap_usd: 20 })
    expect(await GATE(sb({ status: 'active', created_at: haceDias(40), config: { spend_cap_usd: 20 }, libro: gasto(20) }))).toMatchObject({ blocked: true, cap_usd: 20 })
  })
  it('FALLA HACIA LO NORMAL: sin ficha, con error al leerla o sin estado/fecha ⇒ 8, nunca 13', async () => {
    for (const s of [sb({ sinFicha: true, libro: gasto(9) }), sb({ fichaError: true, libro: gasto(9) }), sb({ created_at: haceDias(1), libro: gasto(9) }), sb({ status: 'onboarding', libro: gasto(9) })])
      expect(await GATE(s)).toMatchObject({ blocked: true, cap_usd: 8 })
  })
  it('el kill-switch sigue apagando todo y RUN_SPEND_CAP_USD más alto que el cupo manda', async () => {
    process.env.RUN_SPEND_CAP_ENFORCE = 'false'
    expect((await GATE(sb({ status: 'active', libro: gasto(99) }))).reason).toBe('disabled')
    delete process.env.RUN_SPEND_CAP_ENFORCE; process.env.RUN_SPEND_CAP_USD = '20'
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(15) }))).toMatchObject({ blocked: false, cap_usd: 20 })
  })
  it('resolveClientCapContext trae en UNA lectura el tope, el estado y la fecha, y devuelve todo null si falla', async () => {
    expect(await resolveClientCapContext(sb({ status: 'onboarding', created_at: '2026-10-19T00:00:00Z', config: { spend_cap_usd: '3.3' }, libro: [] }), 'c1')).toEqual({ override: 3.3, status: 'onboarding', createdAt: '2026-10-19T00:00:00Z' })
    expect(await resolveClientCapContext(sb({ fichaError: true, libro: [] }), 'c1')).toEqual({ override: null, status: null, createdAt: null })
  })
})

describe('el pre-vuelo de la planeación lee el MISMO cupo (si no, diría «sin cupo» donde el freno todavía deja pasar)', () => {
  const dbPrevuelo = (ficha: Record<string, unknown>, gastos: number[]) => ({
    from(tabla: string) {
      if (tabla === 'clients') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ficha, error: null }) }), or: async () => ({ data: [{ id: 'c1' }], error: null }) }) }
      const filas = gastos.map((c) => ({ cost_usd: c }))
      return { select: () => ({ gte: () => ({ eq: async () => ({ data: filas, error: null }), in: async () => ({ data: filas, error: null }) }) }) }
    },
  }) as never
  it('cliente onboarding de ayer: el cupo del pre-vuelo es 13; active o viejo, 8; la ficha manda (sube o baja)', async () => {
    const { puertosDeSupabase } = await import('../src/lib/planeacion/prevuelo-supabase')
    const ahora = () => new Date(AHORA)
    const c = async (ficha: Record<string, unknown>) => puertosDeSupabase(dbPrevuelo(ficha, [5, 3]), ahora).cupo('c1')
    expect(await c({ config: {}, status: 'onboarding', created_at: haceDias(1) })).toMatchObject({ ok: true, cap_usd: 13, generico_usd: 13, override_usd: null, gastado_24h_usd: 8 })
    expect(await c({ config: {}, status: 'active', created_at: haceDias(1) })).toMatchObject({ ok: true, cap_usd: 8 })
    expect(await c({ config: {}, status: 'onboarding', created_at: haceDias(30) })).toMatchObject({ ok: true, cap_usd: 8 })
    expect(await c({ config: { spend_cap_usd: 6 }, status: 'onboarding', created_at: haceDias(1) })).toMatchObject({ ok: true, cap_usd: 6, override_usd: 6 })
    expect(await c({ config: { spend_cap_usd: 20 }, status: 'onboarding', created_at: haceDias(30) })).toMatchObject({ ok: true, cap_usd: 20, generico_usd: 8, override_usd: 20 })
  })
})
