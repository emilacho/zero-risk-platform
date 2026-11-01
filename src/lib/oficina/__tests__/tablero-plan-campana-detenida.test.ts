/**
 * HALLAZGO de CC3 (01-nov): una reescritura mueve la campaña al plan nuevo sin tocar su estado. Con la campaña detenida, aprobar no saca el brief y la cadena responde
 * «ya abierta» como si hubiera salido bien. Las dos puertas se detienen ANTES, con el motivo a la vista, y no tocan la campaña. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { ACCIONES } from '../tablero/acciones'
import { CAMPANA_DETENIDA } from '../tablero/plan'
import { DbFalsa } from './dbfalsa'

const AHORA = new Date('2026-11-01T17:00:00Z')
const llamar = (accion: string, db: DbFalsa, cuerpo: Record<string, unknown>) => ACCIONES[accion]({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo, reviewer: 'emilio' })
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P1 = '11111111-1111-4111-8111-111111111111'
const plan = (extra: Record<string, unknown> = {}) => ({ id: P1, client_id: C, output_type: 'campaign_plan_90d', status: 'draft', created_at: '2026-10-30T10:00:00Z', provenance_tag: {}, ...extra })
const campana = (extra: Record<string, unknown>) => ({ id: 'k1', client_id: C, plan_id: P1, seco: false, estado: 'pausada', estado_motivo: 'pausa de pruebas por decisión del dueño', ...extra })
const CAMBIOS = { plan_id: P1, texto: 'Cambia la zona de reparto', confirmo_gasto: true, tope_usd: 5 }
const PUERTAS: Array<[string, Record<string, unknown>]> = [['plan-cambios', CAMBIOS], ['plan-aprobar', { plan_id: P1 }]]

describe('campaña detenida', () => {
  it('los estados son los que no vuelven a armar', () => {
    expect(CAMPANA_DETENIDA).toEqual(['pausada', 'necesita_humano', 'activa'])
  })
  it.each(PUERTAS.flatMap(([a, c]) => CAMPANA_DETENIDA.map((e) => [a, c, e] as const)))('%s con campaña %s: 409 con el motivo, sin gastar ni tocar nada', async (accion, cuerpo, estado) => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('cadena_campanas', [campana({ estado })])
      .semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, estado: 'pendiente', sobre_de_reanudacion: {} }])
    const s = await llamar(accion, db, cuerpo)
    expect(s.status).toBe(409)
    expect(s.cuerpo.error).toBe('campana_detenida')
    expect(String(s.cuerpo.detalle)).toContain(estado)
    expect(String(s.cuerpo.detalle)).toContain('pausa de pruebas')
    expect(s.despertar_flujo).toBeUndefined()
    expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
    expect(db.tablas['plan_cambios'] ?? []).toHaveLength(0)
    expect(db.tablas['plan_aprobaciones'][0].estado).toBe('pendiente')
    expect(db.tablas['cadena_campanas'][0].estado).toBe(estado)
  })
  it.each(PUERTAS.flatMap(([a, c]) => ['abierta', 'estrategia', 'calendario', 'cerrada', 'reemplazada'].map((e) => [a, c, e] as const)))('%s con campaña %s: sigue', async (accion, cuerpo, estado) => {
    const s = await llamar(accion, new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('cadena_campanas', [campana({ estado })]), cuerpo)
    expect(s.status).toBe(200)
  })
  it.each(PUERTAS)('%s: una campaña detenida de OTRO plan no estorba (el plan nuevo abre la suya), ni una de ensayo', async (accion, cuerpo) => {
    const otra = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('cadena_campanas', [campana({ plan_id: 'otro-plan' })])
    expect((await llamar(accion, otra, cuerpo)).status).toBe(200)
    const seco = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('cadena_campanas', [campana({ seco: true })])
    expect((await llamar(accion, seco, cuerpo)).status).toBe(200)
  })
  it.each(PUERTAS)('%s: si la campaña no se puede leer, 500 y nada se escribe: no se asume que no hay', async (accion, cuerpo) => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()])
    db.fallar['cadena_campanas'] = 'se cayó'
    const s = await llamar(accion, db, cuerpo)
    expect(s.status).toBe(500); expect(s.cuerpo.error).toBe('planes_error')
    expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
    expect(db.tablas['plan_cambios'] ?? []).toHaveLength(0)
  })
})
