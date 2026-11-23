/**
 * EL CUPO DE ARRANQUE (CC#2 · 20-oct · opción A firmada por Emilio 15:15). US$ 0 · sin base ni modelo.
 * Un cliente `onboarding` en sus primeros días tiene techo de 24 h = el MAYOR entre el general y RUN_ONBOARDING_CAP_USD; al pasar a `active` vuelve al general.
 * 18-nov (3 × lo medido): los dos por omisión quedaron en 24,05 → 60 (21-nov · A1: 24,05 → 60, firma de Emilio), así que con los valores por omisión el cupo no suma nada; el mecanismo se prueba con un cupo configurado más alto.
 * No cambia: la vara por corrida (13,58 desde el 18-nov), que la ficha MANDA (sube o baja, desde el 30-oct), el kill-switch, y que sin dato de la ficha rige lo normal (falla hacia lo normal, nunca hacia lo alto).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkRunSdkSpendCap, resolveClientCapContext, techoGenericoDeArranque, DEFAULT_ONBOARDING_SPEND_CAP_USD, DEFAULT_ONBOARDING_DAYS, DEFAULT_RUN_SCOPED_CAP_USD, DEFAULT_RUN_SPEND_CAP_USD } from '../src/lib/run-sdk-spend-gate'

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
  // el general se pasa como argumento: aquí uno MÁS BAJO que el cupo (8, el de antes del 18-nov, o un RUN_SPEND_CAP_USD bajo en el entorno) para ver el mecanismo
  const t = (status: unknown, createdAt: unknown, generico = 8) => techoGenericoDeArranque({ status, createdAt, nowMs: AHORA, generico })
  it('onboarding y dentro de sus primeros días ⇒ el cupo; los valores por omisión son 60 y 7 días (13 → 3 × lo medido, 18-nov → 60, 21-nov)', () => {
    expect(DEFAULT_ONBOARDING_SPEND_CAP_USD).toBe(60); expect(DEFAULT_ONBOARDING_DAYS).toBe(7)
    expect(t('onboarding', haceDias(0.1))).toEqual({ cap: DEFAULT_ONBOARDING_SPEND_CAP_USD, arranque: true }); expect(t('onboarding', haceDias(6.9))).toEqual({ cap: DEFAULT_ONBOARDING_SPEND_CAP_USD, arranque: true })
  })
  it('18-nov · con los valores por omisión de hoy el cupo (60) es IGUAL al general (60): no suma nada y no se marca arranque', () => {
    expect(DEFAULT_ONBOARDING_SPEND_CAP_USD).toBe(DEFAULT_RUN_SPEND_CAP_USD)
    expect(t('onboarding', haceDias(1), DEFAULT_RUN_SPEND_CAP_USD)).toEqual({ cap: DEFAULT_RUN_SPEND_CAP_USD, arranque: false })
  })
  it('pasados los 7 días, o en cualquier otro estado, rige el general (active, churned, paused, null, otro tipo)', () => {
    expect(t('onboarding', haceDias(7.1))).toEqual({ cap: 8, arranque: false })
    for (const s of ['active', 'churned', 'paused', 'Onboarding', ' onboarding', null, undefined, 7, {}]) expect(t(s, haceDias(1)), String(s)).toEqual({ cap: 8, arranque: false })
  })
  it('sin fecha legible, con fecha futura o ilegible: rige el general (nunca el alto por duda)', () => {
    for (const c of [null, undefined, '', 'ayer', 12345, haceDias(-2)]) expect(t('onboarding', c), String(c)).toEqual({ cap: 8, arranque: false })
  })
  it('nunca BAJA del general: con el general en 70 y el cupo en 60 rige 70 y no se marca arranque', () => {
    expect(t('onboarding', haceDias(1), 70)).toEqual({ cap: 70, arranque: false })
  })
  it('las variables mandan: cupo y días se leen del entorno; valores ilegibles vuelven a 60 y 7', () => {
    process.env.RUN_ONBOARDING_CAP_USD = '10'; process.env.RUN_ONBOARDING_DIAS = '2'
    expect(t('onboarding', haceDias(1))).toEqual({ cap: 10, arranque: true }); expect(t('onboarding', haceDias(3))).toEqual({ cap: 8, arranque: false })
    for (const raro of ['', 'mucho', '0', '-5', 'NaN']) { process.env.RUN_ONBOARDING_CAP_USD = raro; process.env.RUN_ONBOARDING_DIAS = raro; expect(t('onboarding', haceDias(1)), raro).toEqual({ cap: DEFAULT_ONBOARDING_SPEND_CAP_USD, arranque: true }) }
  })
})

describe('el freno de run-sdk con el cupo de arranque', () => {
  const G = DEFAULT_RUN_SPEND_CAP_USD
  it('18-nov · con los valores por omisión el cupo no suma: un cliente onboarding de ayer se frena en el general (60) y no se marca arranque', async () => {
    const r = await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(30, 30) }))
    expect(r).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: G }); expect(r).not.toHaveProperty('cupo_de_arranque')
    expect((await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(30, 29.99) }))).blocked).toBe(false)
  })
  // el MECANISMO, con un cupo configurado por encima del general (RUN_ONBOARDING_CAP_USD = 70): con los valores por omisión no se ve (ver la prueba de arriba)
  describe('con el cupo configurado por encima del general (70 > 60)', () => {
    beforeEach(() => { process.env.RUN_ONBOARDING_CAP_USD = '70' })
    it('cliente onboarding de ayer: con US$ 65 gastados PASA (el general lo frenaría en 60), y lo dice', async () => {
      const r = await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(32.5, 32.5) }))
      expect(r).toMatchObject({ blocked: false, cap_usd: 70, cupo_de_arranque: true, cap_generico_usd: G })
    })
    it('y se frena en 70: con US$ 70 gastados ya no se lanza la llamada', async () => {
      expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(35, 35) }))).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: 70 })
      expect((await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(35, 34.99) }))).blocked).toBe(false)
    })
    it('el mismo cliente `active` vuelve al general: con US$ 65 se frena', async () => {
      const r = await GATE(sb({ status: 'active', created_at: haceDias(1), libro: gasto(32.5, 32.5) }))
      expect(r).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: G }); expect(r).not.toHaveProperty('cupo_de_arranque')
    })
    it('un cliente olvidado en onboarding hace un mes NO conserva el techo alto', async () => {
      expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(30), libro: gasto(65) }))).toMatchObject({ blocked: true, cap_usd: G })
    })
    it('la vara por corrida de US$ 13,58 NO cambia: una sola corrida que llega a 13,58 se corta aunque el cupo sea 70', async () => {
      const libro = [{ cost_usd: DEFAULT_RUN_SCOPED_CAP_USD, workflow_execution_id: 'corrida-nueva' }]
      expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro }))).toMatchObject({ blocked: true, reason: 'run_over_cap', run_cap_usd: DEFAULT_RUN_SCOPED_CAP_USD })
    })
    it('FALLA HACIA LO NORMAL: sin ficha, con error al leerla o sin estado/fecha ⇒ el general (60), nunca el cupo (70)', async () => {
      for (const s of [sb({ sinFicha: true, libro: gasto(65) }), sb({ fichaError: true, libro: gasto(65) }), sb({ created_at: haceDias(1), libro: gasto(65) }), sb({ status: 'onboarding', libro: gasto(65) })])
        expect(await GATE(s)).toMatchObject({ blocked: true, cap_usd: G })
    })
  })
  it('la ficha MANDA: tope 6 en un cliente onboarding rige 6; tope 80 rige 80 (sube)', async () => {
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), config: { spend_cap_usd: 6 }, libro: gasto(7) }))).toMatchObject({ blocked: true, cap_usd: 6, cap_override_usd: 6 })
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), config: { spend_cap_usd: 80 }, libro: gasto(12) }))).toMatchObject({ blocked: false, cap_usd: 80, cap_override_usd: 80 })
    expect(await GATE(sb({ status: 'active', created_at: haceDias(40), config: { spend_cap_usd: 20 }, libro: gasto(19) }))).toMatchObject({ blocked: false, cap_usd: 20 })
    expect(await GATE(sb({ status: 'active', created_at: haceDias(40), config: { spend_cap_usd: 20 }, libro: gasto(20) }))).toMatchObject({ blocked: true, cap_usd: 20 })
  })
  it('el kill-switch sigue apagando todo y RUN_SPEND_CAP_USD más alto que el cupo manda', async () => {
    process.env.RUN_SPEND_CAP_ENFORCE = 'false'
    expect((await GATE(sb({ status: 'active', libro: gasto(99) }))).reason).toBe('disabled')
    delete process.env.RUN_SPEND_CAP_ENFORCE; process.env.RUN_SPEND_CAP_USD = '80'
    expect(await GATE(sb({ status: 'onboarding', created_at: haceDias(1), libro: gasto(65) }))).toMatchObject({ blocked: false, cap_usd: 80 })
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
  it('cliente onboarding de ayer: el cupo del pre-vuelo es el del freno (70 configurado); active o viejo, el general; la ficha manda (sube o baja)', async () => {
    const { puertosDeSupabase } = await import('../src/lib/planeacion/prevuelo-supabase')
    const ahora = () => new Date(AHORA)
    const c = async (ficha: Record<string, unknown>) => puertosDeSupabase(dbPrevuelo(ficha, [5, 3]), ahora).cupo('c1')
    // con los valores por omisión el cupo es igual al general: el pre-vuelo también dice 60
    expect(await c({ config: {}, status: 'onboarding', created_at: haceDias(1) })).toMatchObject({ ok: true, cap_usd: DEFAULT_RUN_SPEND_CAP_USD, generico_usd: DEFAULT_RUN_SPEND_CAP_USD })
    process.env.RUN_ONBOARDING_CAP_USD = '70'
    expect(await c({ config: {}, status: 'onboarding', created_at: haceDias(1) })).toMatchObject({ ok: true, cap_usd: 70, generico_usd: 70, override_usd: null, gastado_24h_usd: 8 })
    expect(await c({ config: {}, status: 'active', created_at: haceDias(1) })).toMatchObject({ ok: true, cap_usd: DEFAULT_RUN_SPEND_CAP_USD })
    expect(await c({ config: {}, status: 'onboarding', created_at: haceDias(30) })).toMatchObject({ ok: true, cap_usd: DEFAULT_RUN_SPEND_CAP_USD })
    expect(await c({ config: { spend_cap_usd: 6 }, status: 'onboarding', created_at: haceDias(1) })).toMatchObject({ ok: true, cap_usd: 6, override_usd: 6 })
    expect(await c({ config: { spend_cap_usd: 20 }, status: 'onboarding', created_at: haceDias(30) })).toMatchObject({ ok: true, cap_usd: 20, generico_usd: DEFAULT_RUN_SPEND_CAP_USD, override_usd: 20 })
  })
})
