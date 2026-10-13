/**
 * r79 · D3 · el ensayo en seco guarda el parte MARCADO como seco (otra llave de lote, marca de prueba del cerebro), la puerta de la oficina lo halla por su uuid,
 * nunca cuenta como «ya hay parte» de un lote real y vence solo. Almacén en memoria: US$ 0.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { filasAutoproducir, HORAS_DE_VIDA_DEL_PARTE_SECO } from '../autoproducir'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { relojDeLaCadena } from '../reloj'

const A = clienteA()
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function almacen() {
  const al = new AlmacenMemoria({ contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta' }, journeys: [] })
  al.campanas.push({ id: 'camp-1', client_id: A.clientId, plan_id: 'plan-1', estado: 'activa', seco: true, autoproducir: true, fecha_inicio: '2026-10-10', fecha_fin: '2026-12-31', presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna' } as never)
  return al
}
const fila = (lote: string) => ({ title: 'Parte de trabajo', content: '## Brief b1\nTexto', content_text: '## Brief b1\nTexto', producing_agent: 'brief', status: 'draft', provenance_tag: { valido: true, lote_key: lote, plan_id: 'plan-1', campana_id: 'camp-1', familias_por_brief: [{ brief_id: 'b1', fila_id: 'f1', familia: 'post_img' }, { brief_id: 'b2', fila_id: 'f2', familia: 'carrusel' }] } })
const parteSeco = (lote = 'L1') => ({ lote, valido: true, briefs: [{ brief_id: 'b1', fila_id: 'f1', familia: 'post_img' }, { brief_id: 'b2', fila_id: 'f2', familia: 'carrusel' }], fila: fila(lote) })
const llamar = (al: AlmacenMemoria, ps: unknown) => filasAutoproducir(al, { ...wf, campana_id: 'camp-1', dry_run: true, parte_seco: ps })

describe('D3 · parte de seco', () => {
  it('se guarda con uuid, marcado seco y con otra llave de lote; los sobres llevan ese uuid (la puerta de la oficina lo acepta)', async () => {
    const al = almacen()
    const r = await llamar(al, parteSeco())
    expect(r.status).toBe(200)
    expect(al.partesSecos).toHaveLength(1)
    const p = al.partesSecos[0]
    expect(p.id).toMatch(RE_UUID)
    expect(p.fila.provenance_tag).toMatchObject({ seco: true, prueba_seco: true, lote_key: 'seco:L1' })
    expect(r.cuerpo.parte_id).toBe(p.id)
    const ev = (await al.sala.select({ tenant_id: A.clientId })) as unknown as Array<{ payload: { envelope_payload: { parte_id: string } } }>
    expect(new Set(ev.map((e) => e.payload.envelope_payload.parte_id))).toEqual(new Set([p.id]))
  })
  it('NUNCA cuenta como «ya hay parte» de un lote real: su llave de lote no es la del lote', async () => {
    const al = almacen(); await llamar(al, parteSeco('L1'))
    expect(al.partesSecos.some((x) => x.fila.provenance_tag.lote_key === 'L1')).toBe(false)
  })
  it('repetir el ensayo reutiliza el mismo parte (no se acumulan) y los sobres salen como duplicados', async () => {
    const al = almacen()
    const a = await llamar(al, parteSeco()); const b = await llamar(al, parteSeco())
    expect(al.partesSecos).toHaveLength(1)
    expect(b.cuerpo.parte_id).toBe(a.cuerpo.parte_id)
    expect(b.cuerpo.duplicados).toBe(2)
  })
  it('r81 · la llave sale del lote de verdad (provenance_tag.lote_key) aunque el flujo mande `lote` vacío: dos lotes de una campaña NO se pisan el parte', async () => {
    const al = almacen()
    const con = (lote_key: string) => { const p = parteSeco('x'); return { ...p, lote: '', fila: { ...p.fila, provenance_tag: { ...p.fila.provenance_tag, lote_key } } } }
    await llamar(al, con('camp-1:2026-W43:1')); await llamar(al, con('camp-1:2026-W44:1')); await llamar(al, con('camp-1:2026-W43:1'))
    expect(al.partesSecos.map((x) => x.fila.provenance_tag.lote_key).sort()).toEqual(['seco:camp-1:2026-W43:1', 'seco:camp-1:2026-W44:1'])
  })
  it('vence solo: al pasar su vida, la siguiente llamada de ensayo o el vigía lo barre', async () => {
    const al = almacen(); await llamar(al, parteSeco('L1'))
    al.partesSecos[0].vence_en = new Date(Date.now() - 1000).toISOString()
    await llamar(al, parteSeco('L2'))
    expect(al.partesSecos.map((x) => x.fila.provenance_tag.lote_key)).toEqual(['seco:L2'])
    al.partesSecos[0].vence_en = new Date(Date.now() - 1000).toISOString()
    await relojDeLaCadena(al, { ...wf, seco: true }, new Date().toISOString())
    expect(al.partesSecos).toHaveLength(0)
    expect(HORAS_DE_VIDA_DEL_PARTE_SECO).toBeGreaterThan(0)
  })
  it('un parte seco no válido no se guarda ni emite; sin `fila` queda el comportamiento de antes (id seco:…)', async () => {
    const al = almacen()
    const mal = await llamar(al, { ...parteSeco(), valido: false })
    expect(mal.cuerpo.emite).toBe(false); expect(al.partesSecos).toHaveLength(0)
    const { fila: _f, ...sinFila } = parteSeco()
    const r = await llamar(al, sinFila)
    expect(String(r.cuerpo.parte_id)).toMatch(/^seco:/); expect(al.partesSecos).toHaveLength(0)
  })
  it('con dry_run:false se ignora el parte_seco (no se guarda nada en seco)', async () => {
    const al = almacen()
    const r = await filasAutoproducir(al, { ...wf, campana_id: 'camp-1', dry_run: false, parte_id: 'p-no-existe', parte_seco: parteSeco() })
    expect(al.partesSecos).toHaveLength(0)
    expect([404, 409]).toContain(r.status)
  })
})
