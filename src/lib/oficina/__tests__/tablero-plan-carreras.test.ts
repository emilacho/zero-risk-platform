/**
 * Lo que CC3 pidió fijar al certificar la revisión 799 (mutantes P01, P02, P19, P09 vivos). La base falsa es secuencial: aquí el «otro clic» se intercala justo
 * entre la lectura de la compuerta y su actualización, que es la ventana real de un doble brief. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { ACCIONES } from '../tablero/acciones'
import { TOPE_DE_VUELTAS, TOPE_REESCRITURA_USD } from '../tablero/plan'
import { DbFalsa } from './dbfalsa'

const AHORA = new Date('2026-11-01T15:00:00Z')
const llamar = (accion: string, db: DbFalsa, cuerpo: Record<string, unknown>) => ACCIONES[accion]({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo, reviewer: 'emilio' })
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P1 = '11111111-1111-4111-8111-111111111111'
const plan = (extra: Record<string, unknown> = {}) => ({ id: P1, client_id: C, output_type: 'campaign_plan_90d', status: 'draft', created_at: '2026-10-30T10:00:00Z', provenance_tag: {}, ...extra })

/** justo antes de la PRIMERA actualización de la compuerta, otro clic ya la reclamó: la fila cambia entre la lectura y el UPDATE de este clic */
function otroClicSeAdelanta(db: DbFalsa, cambio: Record<string, unknown>) {
  const from = db.from.bind(db)
  let hecho = false
  db.from = ((t: string) => {
    const q = from(t) as unknown as { update: (p: Record<string, unknown>) => unknown }
    if (t === 'plan_aprobaciones' && !hecho) {
      const update = q.update.bind(q)
      q.update = (p) => { hecho = true; Object.assign(db.tablas['plan_aprobaciones'][0], cambio); return update(p) }
    }
    return q
  }) as typeof db.from
}

describe('dos clics en plan-aprobar: solo uno despierta la segunda mitad', () => {
  const comp = (extra: Record<string, unknown>) => ({ id: 'a1', plan_id: P1, client_id: C, version: 1, sobre_de_reanudacion: {}, ...extra })
  it.each<[string, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>]>([
    ['primera aprobación', { status: 'draft' }, { estado: 'pendiente' }, { estado: 'aprobado', despertado: true }],
    ['aprobación cortada a mitad', { status: 'approved' }, { estado: 'pendiente' }, { estado: 'aprobado', despertado: true }],
    ['reintento tras no despertar', { status: 'approved' }, { estado: 'aprobado', despertado: false }, { despertado: null }],
  ])('%s: el clic que llega segundo no despierta nada y responde 409', async (_n, p, inicial, delOtro) => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan(p)]).semilla('plan_aprobaciones', [comp(inicial)])
    otroClicSeAdelanta(db, delOtro)
    const s = await llamar('plan-aprobar', db, { plan_id: P1 })
    expect(s.status).toBe(409)
    expect(s.cuerpo.error).toBe('plan_ya_aprobado')
    expect(s.despertar_flujo).toBeUndefined()
  })
})

describe('los valores firmados', () => {
  it('el pedido guarda la vuelta REAL: un plan versión 2 es la vuelta 2', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan({ provenance_tag: { version: 2 } })])
    const s = await llamar('plan-cambios', db, { plan_id: P1, texto: 'Cambia la zona de reparto', confirmo_gasto: true, tope_usd: 5 })
    expect(s.status).toBe(200)
    expect(db.tablas['plan_cambios'][0].vuelta).toBe(2)
  })
  it('el tope de una reescritura es US$ 8 y son 3 vueltas (literales: cambiarlos es una decisión, no un retoque)', () => {
    expect(TOPE_REESCRITURA_USD).toBe(8)
    expect(TOPE_DE_VUELTAS).toBe(3)
  })
})
