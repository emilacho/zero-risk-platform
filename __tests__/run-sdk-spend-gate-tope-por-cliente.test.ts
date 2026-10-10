/**
 * Relevo 59 · la puerta ANTES de cada llamada de modelo para la prueba desde cero: `clients.config.spend_cap_usd` baja el techo de las 24 h de ESE cliente.
 * Prueba en seco: un libro simulado, sin base ni modelo. El tope solo BAJA el techo y falla ABIERTO.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkRunSdkSpendCap, resolveClientCapOverrideUsd, DEFAULT_RUN_SPEND_CAP_USD } from '../src/lib/run-sdk-spend-gate'

type Fila = { cost_usd: number; workflow_execution_id: string }
/** libro simulado: la ficha del cliente (con su config) y las filas de agent_invocations */
function sb(opts: { config?: unknown; fichaError?: boolean; libro: Fila[]; sinMaybeSingle?: boolean }) {
  return {
    from(tabla: string) {
      if (tabla === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => (opts.sinMaybeSingle ? Promise.reject(new Error('sin maybeSingle')) : opts.fichaError ? { data: null, error: { message: 'fallo' } } : { data: { config: opts.config, canonical_client_id: null }, error: null }),
            }),
            or: async () => ({ data: [{ id: 'c1' }], error: null }),
          }),
        }
      }
      const q = { select: () => q, eq: () => q, in: () => q, gte: async () => ({ data: opts.libro, error: null }) }
      return q
    },
  } as never
}
const gasto = (...v: number[]): Fila[] => v.map((x, i) => ({ cost_usd: x, workflow_execution_id: 'e' + i }))
const GATE = (s: never, run = 'corrida-nueva') => checkRunSdkSpendCap(s, 'c1', { runId: run, notify: (async () => ({ ok: true })) as never })

beforeEach(() => { delete process.env.RUN_SPEND_CAP_ENFORCE; delete process.env.RUN_SPEND_CAP_USD })
afterEach(() => { delete process.env.RUN_SPEND_CAP_ENFORCE; delete process.env.RUN_SPEND_CAP_USD })

describe('tope por cliente · la puerta previa', () => {
  it('sin tope en la ficha: rige el genérico de US$ 8 (nada cambia para los demás clientes)', async () => {
    const r = await GATE(sb({ config: {}, libro: gasto(3.4) }))
    expect(r.blocked).toBe(false); expect(r.cap_usd).toBe(DEFAULT_RUN_SPEND_CAP_USD); expect(r).not.toHaveProperty('cap_override_usd')
  })
  it('con tope 3,30: lo gastado por debajo pasa; en el tope o por encima NO se lanza la llamada', async () => {
    const config = { spend_cap_usd: 3.3 }
    const pasa = await GATE(sb({ config, libro: gasto(1.1, 2.1) })) // 3,2
    expect(pasa).toMatchObject({ blocked: false, cap_usd: 3.3, cap_override_usd: 3.3 })
    const justo = await GATE(sb({ config, libro: gasto(1.65, 1.65) })) // 3,3
    expect(justo).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: 3.3 })
    const pasado = await GATE(sb({ config, libro: gasto(3.5) }))
    expect(pasado).toMatchObject({ blocked: true, reason: 'over_cap' })
  })
  it('SOLO BAJA: un tope mayor que el genérico se ignora (no se puede usar para subir el freno)', async () => {
    const r = await GATE(sb({ config: { spend_cap_usd: 50 }, libro: gasto(9) }))
    expect(r).toMatchObject({ blocked: true, reason: 'over_cap', cap_usd: 8 }); expect(r).not.toHaveProperty('cap_override_usd')
    expect((await GATE(sb({ config: { spend_cap_usd: 50 }, libro: gasto(7) }))).blocked).toBe(false)
  })
  it('respeta también el techo del entorno si es más bajo que el tope de la ficha', async () => {
    process.env.RUN_SPEND_CAP_USD = '2'
    const r = await GATE(sb({ config: { spend_cap_usd: 3.3 }, libro: gasto(2.5) }))
    expect(r).toMatchObject({ blocked: true, cap_usd: 2 })
  })
  it('FALLA ABIERTO: tope ilegible, cero, negativo, texto, ficha con error o sin ficha ⇒ techo genérico (nunca bloquea de más)', async () => {
    for (const config of [{ spend_cap_usd: 0 }, { spend_cap_usd: -1 }, { spend_cap_usd: 'mucho' }, { spend_cap_usd: null }, null, [], 'x']) {
      const r = await GATE(sb({ config, libro: gasto(5) }))
      expect(r.blocked, JSON.stringify(config)).toBe(false); expect(r.cap_usd).toBe(8)
    }
    expect((await GATE(sb({ fichaError: true, libro: gasto(5) }))).blocked).toBe(false)
    expect((await GATE(sb({ sinMaybeSingle: true, libro: gasto(5) }))).blocked).toBe(false)
  })
  it('acepta el tope como número en texto («3.3») y no mezcla clientes: cada ficha trae el suyo', async () => {
    expect(await resolveClientCapOverrideUsd(sb({ config: { spend_cap_usd: '3.3' }, libro: [] }), 'c1')).toBe(3.3)
    expect(await resolveClientCapOverrideUsd(sb({ config: {}, libro: [] }), 'c1')).toBeNull()
  })
  it('la vara por corrida de US$ 5 sigue mandando y el kill-switch sigue apagando todo', async () => {
    const run = await checkRunSdkSpendCap(sb({ config: { spend_cap_usd: 3.3 }, libro: [{ cost_usd: 5.2, workflow_execution_id: 'misma' }] }), 'c1', { runId: 'misma', notify: (async () => ({ ok: true })) as never })
    expect(run).toMatchObject({ blocked: true, reason: 'run_over_cap' })
    process.env.RUN_SPEND_CAP_ENFORCE = 'false'
    expect((await GATE(sb({ config: { spend_cap_usd: 3.3 }, libro: gasto(9) }))).reason).toBe('disabled')
  })
})

describe('la cuenta del corte de la prueba (US$ 5,00 que nunca se pasan)', () => {
  const APIFY = 1.05, TOPE_PRUEBA = 3.3
  it('modelo registrado < 3,30 al lanzar + la llamada MÁS CARA conocida (0,65) + Apify ⇒ ≤ 5,00', () => {
    expect(+(TOPE_PRUEBA + 0.65 + APIFY).toFixed(2)).toBeLessThanOrEqual(5)
  })
  it('con la simulación de la prueba: cada llamada se lanza solo si lo registrado < 3,30; el peor caso (cada llamada al máximo) nunca pasa de 5,00', async () => {
    const config = { spend_cap_usd: TOPE_PRUEBA }
    const llamadas = [0.47, 0.04, 0.60, 0.04, 0.45, 0.60, 0.60, 0.60, 0.65, 0.65, 0.65, 0.65, 0.65] // el peor caso, una tras otra
    let libro: Fila[] = [], lanzadas = 0
    for (const [i, costo] of llamadas.entries()) {
      const r = await GATE(sb({ config, libro }), 'e' + i)
      if (r.blocked) break
      lanzadas++; libro = [...libro, { cost_usd: costo, workflow_execution_id: 'e' + i }]
    }
    const modelo = libro.reduce((a, f) => a + f.cost_usd, 0)
    expect(lanzadas).toBeLessThan(llamadas.length) // la puerta SÍ cortó
    expect(+(modelo + APIFY).toFixed(2)).toBeLessThanOrEqual(5)
    expect(modelo).toBeLessThan(TOPE_PRUEBA + 0.65)
  })
})
