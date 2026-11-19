/**
 * 19-nov · la revisión chica de pruebas que sugirió CC6 (todo ya publicado; solo pruebas, el código no cambia):
 *   · c2 (#1180): la guarda de la carrera también vale con la llave del tramo (`:r<tramo>`): dos intentos distintos abiertos a la vez no pagan los dos;
 *   · c6 (#1180): con la palanca del nuevo orden, una campaña en `calendario` no recibe el sobre del reloj (la tanda la reemite el vigía);
 *   · a1 (#1175): abrir con sedes y zona leídas deja `estado_motivo` vacío (sin el aviso viejo «sin descontar feriados»).
 * Cliente sintético. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, relojDeLaCadena } from '../index'
import { llaveDeReintentoDelPaso, prepararCorrida } from '../nucleo'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Corrida } from '../tipos'

const A = clienteA()
const AYER = '2026-10-08T08:00:00Z'
const AHORA = '2026-10-09T08:00:00Z'
const TARDE = '2026-10-09T14:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
function almacen() {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'encendida' },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
}
async function abierta(al: AlmacenMemoria) {
  const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
  return (r.cuerpo.campana as { id: string }).id
}
const fallida = (id: number, campana_id: string, paso: string, clave: string, intento: number, creada_en: string) => ({
  id, campana_id, paso, clave_idempotencia: clave, intento, workflow_id: 'wf', workflow_execution_id: 'x', modelo: 'm', costo_usd: 0.1, estado: 'fallida', plazo_en: null, error: 'x',
  revision_editor: 'saltada_por_diseno', salida_estructurada: true, esquema_hash: 'h', seco: true, creada_en,
}) as unknown as Corrida

describe('c2 · la carrera con la llave del tramo', () => {
  it('🔴 la base agotó sus 3 intentos ayer; hoy otra llamada abre a la vez OTRO intento de la llave :r<tramo>: esta se descarta antes de pagar', async () => {
    const al = almacen(); const id = await abierta(al)
    for (let i = 1; i <= 3; i++) al.corridas.push(fallida(800 + i, id, 'estrategia', 'v1:c0', i, AYER))
    const llave = llaveDeReintentoDelPaso('v1:c0', AHORA)
    const orig = al.abrirCorrida.bind(al)
    // justo antes de que esta entre, la otra (id menor) entra con otro intento de la MISMA llave del tramo: el único (llave + intento) no las junta
    al.abrirCorrida = async (c) => {
      const rival = await orig({ ...c, intento: c.intento + 1, workflow_execution_id: 'la-otra' })
      expect(rival.creada).toBe(true)
      return orig(c)
    }
    const r = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', 'wf', 'e', AHORA, 'm', 'h')
    expect(r.tipo).toBe('en_curso')
    if (r.tipo !== 'en_curso') return
    expect(r.corrida.workflow_execution_id).toBe('la-otra')
    expect(r.corrida.clave_idempotencia).toBe(llave)
    const abiertas = al.corridas.filter((c) => c.clave_idempotencia === llave && c.estado === 'en_curso')
    expect(abiertas).toHaveLength(1) // la de esta llamada se descartó: paga una sola
  })
  it('sin la otra, la misma llamada abre su intento de la llave del tramo (la prueba no pasa por no llegar a la guarda)', async () => {
    const al = almacen(); const id = await abierta(al)
    for (let i = 1; i <= 3; i++) al.corridas.push(fallida(800 + i, id, 'estrategia', 'v1:c0', i, AYER))
    const r = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', 'wf', 'e', AHORA, 'm', 'h')
    expect(r.tipo).toBe('lista')
    expect(r.tipo === 'lista' ? r.corrida.clave_idempotencia : '').toBe(llaveDeReintentoDelPaso('v1:c0', AHORA))
  })
})

describe('c6 · el reloj y la palanca del nuevo orden', () => {
  async function atascadaEnCalendario(nuevoOrden: boolean) {
    const al = almacen(); const id = await abierta(al)
    al.campanas[0].estado = 'calendario'
    for (let i = 1; i <= 3; i++) al.corridas.push(fallida(800 + i, id, 'calendario', 't1:v1:c0', i, AHORA))
    if (nuevoOrden) al.config.set('nuevo_orden', { clientes: [A.clientId] })
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }, TARDE)
    return (al.sobresEmitidos as Array<{ idempotency_key: string }>).filter((s) => s.idempotency_key === `${id}:reintento:2026-10-09pm`)
  }
  it('🔴 con la palanca encendida para el cliente, la campaña en `calendario` NO recibe el sobre (el vigía ya reemite la tanda)', async () => {
    expect(await atascadaEnCalendario(true)).toHaveLength(0)
  })
  it('con la palanca apagada, la misma campaña sí lo recibe', async () => {
    expect(await atascadaEnCalendario(false)).toHaveLength(1)
  })
})

describe('a1 · abrir con sedes y zona leídas', () => {
  it('🔴 `estado_motivo` queda vacío: nada del aviso viejo «sin descontar feriados»', async () => {
    const al = almacen(); await abierta(al)
    const c = al.campanas[0]
    expect(c.sedes.length).toBeGreaterThan(0)
    expect(c.estado_motivo).toBeNull()
  })
})
