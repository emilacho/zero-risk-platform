/**
 * r79 · D5 · el sobre de autoproducir lleva la fecha y la hora de la fila del calendario de cada brief; la oficina las usa para nombrar y fechar la pieza. US$ 0.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { filasAutoproducir, sobresDeProducir } from '../autoproducir'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { validarSobre } from '../../oficina/sobre'

const A = clienteA()
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })
const filaCal = (id: string, fecha: string, hora: string | null) => ({ id, fecha, hora, tanda: 1, semana: 1, dia_semana: 1, red: 'instagram', formato: 'foto', pilar: null, tema: null, sede: null, requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'valida', avisos: [], campana_id: 'camp-1', calendario_version: 1 })

describe('D5 · la fecha del sobre sale de la fila', () => {
  it('sobresDeProducir: fecha y hora de la fila de cada brief; sin fila en el mapa, el sobre va sin fecha', () => {
    const parte = { id: 'p1', client_id: 'c1', valido: true, briefs: [{ brief_id: 'b1', fila_id: 'f1', familia: 'post_img' }, { brief_id: 'b2', fila_id: 'f2', familia: 'carrusel' }, { brief_id: 'b3', fila_id: 'f9', familia: 'post_img' }] }
    const { sobres } = sobresDeProducir(parte, { dry_run: true, cuando: new Map([['f1', { fecha: '2026-10-20', hora: '10:30' }], ['f2', { fecha: '2026-10-21', hora: null }]]) })
    expect(sobres[0].payload).toMatchObject({ fila_id: 'f1', fecha: '2026-10-20', hora: '10:30' })
    expect(sobres[1].payload).toMatchObject({ fila_id: 'f2', fecha: '2026-10-21' }); expect(sobres[1].payload.hora).toBeUndefined()
    expect(sobres[2].payload.fecha).toBeUndefined()
  })
  it('por la ruta: cada sobre de la sala trae la fecha de SU fila, y la puerta de la oficina lo acepta tal cual', async () => {
    const al = new AlmacenMemoria({ contextos: { [A.clientId]: contextoDe(A) }, config: { flujos: ['wf'], puerta_workflow_id: 'wf-puerta' } })
    al.campanas.push({ id: 'camp-1', client_id: A.clientId, plan_id: 'plan-1', estado: 'activa', seco: true, autoproducir: true, fecha_inicio: '2026-10-10', fecha_fin: '2026-12-31', presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna' } as never)
    al.filasGuardadas.push(filaCal('f1', '2026-10-20', '10:30') as never, filaCal('f2', '2026-10-22', '18:00') as never)
    al.partesSecos.push({ id: '11111111-1111-4111-8111-111111111111', client_id: A.clientId, lote_key: 'seco:x', vence_en: '2999-01-01', fila: { title: 't', content: 'c', provenance_tag: { valido: true, familias_por_brief: [{ brief_id: 'b1', fila_id: 'f1', familia: 'post_img' }, { brief_id: 'b2', fila_id: 'f2', familia: 'post_img' }] } } })
    const r = await filasAutoproducir(al, { workflow_id: 'wf', workflow_execution_id: 'e', campana_id: 'camp-1', parte_id: '11111111-1111-4111-8111-111111111111', dry_run: true })
    expect(r.cuerpo.emitidos).toBe(2)
    const ev = (await al.sala.select({ tenant_id: A.clientId })) as unknown as Array<{ payload: { envelope_payload: Record<string, unknown> } }>
    const por = Object.fromEntries(ev.map((e) => [e.payload.envelope_payload.brief_id as string, e.payload.envelope_payload]))
    expect(por.b1).toMatchObject({ fecha: '2026-10-20', hora: '10:30' }); expect(por.b2).toMatchObject({ fecha: '2026-10-22', hora: '18:00' })
    for (const p of Object.values(por)) expect(validarSobre({ ...p, parte_id: '11111111-1111-4111-8111-111111111111' }).ok).toBe(true)
  })
})
