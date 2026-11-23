/**
 * 21-nov · #1260 (CC4, GO Lenovo 02:32Z · pedidos de CC6 02:32Z) · ⚠️ TEMPORAL, se quita con el razonamiento temporal.
 *  · EL PLAZO: la corrida de un paso que espera al agente en la misma llamada no vence antes de esa espera (800 s = 13:20). Con el plazo vivo de 6 min,
 *    el vigía la daba por vencida y lanzaba otro agente con el primero vivo. Piso de 14 min para esos 4 pasos; el brief sigue con la config; una config mayor manda.
 *  · LA BOLSA de `2fd5f619` (datos leídos de la base 21-nov 03:5xZ, tal como vienen: numéricos en texto): con sus 3 estrategias caídas sin costo (cuentan 3 × 3 = 9)
 *    y la bolsa en 17,97, la reserva nueva (9 + 3 = 12) cabe; y la bolsa sube sola a 36 (su piso) sin pasar el tope de 300.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, estrategiaPreparar, costoEfectivo } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { bolsaAgrandada } from '../nucleo'
import { ESPERA_DE_LA_VUELTA_S, PASOS_POR_EL_CORREDOR, PLAZO_DE_LLAMADA_POR_DEFECTO_MIN, PLAZO_MINIMO_POR_EL_CORREDOR_MIN, plazoMinimoDelPaso, topeDelPaso, type Paso } from '../constantes'
import type { Campana } from '../almacen'

const A = clienteA()
const ABRE = '2026-10-12T12:00:00Z'
const AHORA = '2026-10-13T12:00:00Z'
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
const almacen = (plazo: unknown) => new AlmacenMemoria({
  contextos: { [A.clientId]: contextoDe(A) },
  planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', plazo_llamada_agente_minutos: plazo },
  journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
})
async function plazoDeLaEstrategia(plazoConfig: unknown): Promise<number> {
  const al = almacen(plazoConfig)
  const c = await abrirCampana(al, { ...wf, client_id: A.clientId, seco: true }, ABRE)
  const id = (c.cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf, campana_id: id }, AHORA)
  expect(p.status).toBe(200)
  const corrida = al.corridas.find((x) => x.paso === 'estrategia')!
  return (Date.parse(corrida.plazo_en!) - Date.parse(AHORA)) / 60_000
}

// 21-nov · opción A (CC1): la espera ya no es la de la misma llamada (800 s) sino la del Wait por webhook del sub-flujo (3 600 s): el piso pasa de 14 a 62 min.
describe('el plazo de la corrida no vence antes que la espera de la vuelta', () => {
  it('🔴 62 min para los 4 pasos por el corredor (cubre los 3 600 s del Wait + 2 min); el brief no tiene piso', () => {
    expect(ESPERA_DE_LA_VUELTA_S).toBe(3600)
    expect(PLAZO_MINIMO_POR_EL_CORREDOR_MIN).toBe(62)
    expect(PLAZO_MINIMO_POR_EL_CORREDOR_MIN * 60).toBeGreaterThan(ESPERA_DE_LA_VUELTA_S)
    const pasos: Paso[] = ['estrategia', 'calendario', 'fechas', 'brief', 'fichas']
    expect(Object.fromEntries(pasos.map((p) => [p, plazoMinimoDelPaso(p)]))).toEqual({ estrategia: 62, calendario: 62, fechas: 62, brief: 0, fichas: 62 })
    for (const p of PASOS_POR_EL_CORREDOR) expect(plazoMinimoDelPaso(p)).toBe(62)
  })
  it('🔴 con la config viva (6 min) la corrida de la estrategia nace con plazo de 62 min, no de 6', async () => {
    expect(PLAZO_DE_LLAMADA_POR_DEFECTO_MIN).toBe(6)
    expect(await plazoDeLaEstrategia(6)).toBe(62)
  })
  it('🔴 una config MAYOR que el piso manda (90 min); una config inválida cae al piso, no a 6', async () => {
    expect(await plazoDeLaEstrategia(90)).toBe(90)
    expect(await plazoDeLaEstrategia(0)).toBe(62)
  })
})

describe('la bolsa de 2fd5f619 cubre las reservas nuevas (datos de la base)', () => {
  const campana = { fecha_inicio: '2026-12-06', fecha_fin: '2026-12-19', semanas_de_tanda: null, presupuesto_planificacion_usd: '17.97', tope_gasto_usd: '300' } as unknown as Campana
  const caidas = [1, 2, 3].map(() => ({ paso: 'estrategia', estado: 'fallida' as const, costo_usd: null }))
  it('🔴 sus 3 estrategias caídas sin costo cuentan 3 × 3 = US$ 9', () => {
    expect(caidas.reduce((s, c) => s + costoEfectivo(c), 0)).toBe(9)
  })
  it('🔴 la reserva de la estrategia (9 + 3 = 12) cabe en la bolsa de hoy (17,97) sin agrandarla', () => {
    expect(9 + topeDelPaso('estrategia')).toBeLessThanOrEqual(17.97)
  })
  it('🔴 y si hace falta, la bolsa sube sola a su piso de 36, dentro del tope de 300', () => {
    expect(bolsaAgrandada(campana, 'estrategia')).toBe(36)
    expect(bolsaAgrandada({ ...campana, tope_gasto_usd: 20 } as unknown as Campana, 'estrategia')).toBe(20) // el candado: nunca pasa el tope de la campaña
    expect(bolsaAgrandada(campana, 'fichas')).toBeNull() // el lector tiene su bolsa: no crece
  })
})
