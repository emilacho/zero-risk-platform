/** 05-nov · encargo de Lenovo: un plan rechazado, reemplazado o vencido no cuenta como «plan real» para el alta. Misma lectura de vigencia que el cerebro (#930/#931), para cualquier cliente. */
import { describe, expect, it } from 'vitest'
import { crearBaseFalsa } from './base-falsa'
import { clientesActivos } from '../clientes'
import { motivoSinPlan, planesDeNoventaDias } from '../plan-vigente'
import { rutaPlan } from '../../cerebro/diario/rutas'

const C = '11111111-1111-4111-8111-111111111111'
const plan = (id: string, o: Record<string, unknown> = {}) => ({ id, client_id: C, output_type: 'campaign_plan_90d', status: 'draft', provenance_tag: {}, ...o })
type T = Record<string, Array<Record<string, unknown>>>
const base = (planes: Array<Record<string, unknown>>, extra: T = {}): T => ({
  clients: [{ id: C, name: 'Cliente Cualquiera', status: 'active', archived_at: null, config: {} }],
  client_brand_books: [{ id: 'm', client_id: C }],
  client_historical_outputs: planes,
  ...extra,
})
const leer = async (t: T) => planesDeNoventaDias(crearBaseFalsa(t as never).db, C)

describe('qué plan cuenta como real', () => {
  it('🔴 un plan abierto cuenta; uno de prueba no', async () => {
    expect(await leer(base([plan('p1')]))).toEqual({ ok: true, vigentes: ['p1'], cerrados: [] })
    expect(await leer(base([plan('p1', { provenance_tag: { prueba_x: true } })]))).toEqual({ ok: true, vigentes: [], cerrados: [] })
  })
  it('🔴 rechazado en la plataforma no cuenta, y dice por qué', async () => {
    const r = await leer(base([plan('r3', { status: 'rejected', provenance_tag: { rechazado_por: 'Emilio', nota_de_rechazo: 'no sirve' } })]))
    expect(r).toMatchObject({ ok: true, vigentes: [] })
    expect(r.ok && r.cerrados[0].motivo).toMatch(/rechazado en la plataforma por Emilio: no sirve/)
  })
  it('🔴 reemplazado no cuenta; la versión nueva sí', async () => {
    const r = await leer(base([plan('a', { provenance_tag: { vigente: false } }), plan('b', { provenance_tag: { superseded_por: 'c' } }), plan('c')]))
    expect(r).toMatchObject({ ok: true, vigentes: ['c'] })
    expect(r.ok && r.cerrados.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('🔴 rechazado en la revisión, vencido sin aprobar o con la aprobación reemplazada: no cuenta', async () => {
    const r = await leer(base([plan('q'), plan('v'), plan('w')], {
      hitl_queue: [
        { client_id: C, output_id: 'q', status: 'rejected', resolved_by: 'Emilio', resolved_at: '2026-11-04T10:00:00Z', decision: {} },
        { client_id: C, output_id: 'v', status: 'expired', resolved_at: '2026-11-04T10:00:00Z', decision: { vencida: true } },
      ],
      plan_aprobaciones: [{ client_id: C, plan_id: 'w', estado: 'reemplazado', version: 1, creado_en: '2026-11-04T10:00:00Z' }],
    }))
    expect(r).toMatchObject({ ok: true, vigentes: [] })
    expect(r.ok && r.cerrados.map((x) => x.motivo)).toEqual(['rechazado en la revisión por Emilio', 'su revisión venció sin aprobación', 'reemplazado por una versión más nueva'])
  })
  it('🔴 una limpieza no es una decisión: el plan sigue contando', async () => {
    const r = await leer(base([plan('p', { status: 'rejected', provenance_tag: { superada: true } }), plan('q')], {
      hitl_queue: [{ client_id: C, output_id: 'q', status: 'rejected', resolved_by: 'limpieza automática', decision: {} }],
    }))
    expect(r).toMatchObject({ ok: true, vigentes: ['p', 'q'] })
  })
  it('🔴 lo de otro cliente no cuenta ni cierra', async () => {
    const r = await leer(base([plan('p'), { ...plan('x'), client_id: 'otro' }], { hitl_queue: [{ client_id: 'otro', output_id: 'p', status: 'rejected', decision: {} }] }))
    expect(r).toEqual({ ok: true, vigentes: ['p'], cerrados: [] })
  })
  it('🔴 si no se puede leer la cola o las aprobaciones, lo dice: no adivina', async () => {
    for (const tabla of ['client_historical_outputs', 'hitl_queue', 'plan_aprobaciones']) {
      const r = await planesDeNoventaDias(crearBaseFalsa(base([plan('p')]) as never, { fallaEn: tabla } as never).db, C)
      expect(r).toMatchObject({ ok: false })
      expect(!r.ok && r.detalle).toContain(tabla)
    }
  })
  it('🔴 sin planes, no lee la cola', async () => {
    expect(await planesDeNoventaDias(crearBaseFalsa(base([]) as never, { fallaEn: 'hitl_queue' } as never).db, C)).toEqual({ ok: true, vigentes: [], cerrados: [] })
  })
  it('🔴 lee más de 5 planes: un cliente con muchas versiones cerradas no esconde la vigente', async () => {
    const viejos = Array.from({ length: 8 }, (_, i) => plan('v' + i, { provenance_tag: { vigente: false } }))
    expect(await leer(base([...viejos, plan('hoy')]))).toMatchObject({ ok: true, vigentes: ['hoy'] })
  })
  it('🔴 el motivo en palabras', () => {
    expect(motivoSinPlan({ cerrados: [] })).toBe('sin plan de 90 días')
    expect(motivoSinPlan({ cerrados: [{ motivo: 'rechazado en la plataforma' }] })).toBe('sin plan de 90 días vigente (el que hay está cerrado: rechazado en la plataforma)')
    expect(motivoSinPlan({ cerrados: [{ motivo: 'a' }, { motivo: 'a' }, { motivo: 'b' }] })).toBe('sin plan de 90 días vigente (los 3 que hay están cerrados: a · b)')
  })
})

describe('el alta del portero', () => {
  it('🔴 un cliente con su único plan rechazado y sin despertar queda fuera, con el motivo', async () => {
    const r = await clientesActivos(crearBaseFalsa(base([plan('r3', { status: 'rejected' })]) as never).db)
    expect(r.ok && r.datos.clientes).toEqual([])
    expect(r.ok && r.datos.excluidos[0].motivos[0]).toMatch(/^sin plan de 90 días vigente \(.*rechazado en la plataforma/)
  })
  it('🔴 con un plan rechazado y otro abierto, entra', async () => {
    const r = await clientesActivos(crearBaseFalsa(base([plan('r3', { status: 'rejected' }), plan('r4')]) as never).db)
    expect(r.ok && r.datos.clientes.map((c) => c.client_id)).toEqual([C])
  })
  it('🔴 con el plan rechazado pero el cerebro ya despertado, entra igual (firma de Emilio del 15-oct)', async () => {
    const r = await clientesActivos(crearBaseFalsa(base([plan('r3', { status: 'rejected' })], { cerebro_portero_corridas: [{ client_id: C, dia: '2026-11-01', estado: 'hecha', resumen: { tipo: 'despertar' } }] }) as never).db)
    expect(r.ok && r.datos.clientes.map((c) => c.client_id)).toEqual([C])
  })
  it('🔴 si la cola no se lee, el alta lo dice', async () => {
    expect(await clientesActivos(crearBaseFalsa(base([plan('p')]) as never, { fallaEn: 'hitl_queue' } as never).db)).toMatchObject({ ok: false, detalle: expect.stringContaining('hitl_queue') })
  })
})

describe('la ruta vieja del diario (retirada, referencia probada)', () => {
  it('🔴 un plan rechazado tampoco cuenta ahí', async () => {
    const r = await rutaPlan(crearBaseFalsa(base([plan('r3', { status: 'rejected' })]) as never).db as never, { dry_run: true }, new Date('2026-11-05T12:00:00Z'))
    const b = r.body as { clientes: unknown[]; excluidos: Array<{ motivos: string[] }> }
    expect(b.clientes).toEqual([])
    expect(b.excluidos[0].motivos.join(' ')).toMatch(/sin plan de 90 días vigente/)
  })
  it('🔴 si la cola no se lee, responde lectura fallida', async () => {
    const r = await rutaPlan(crearBaseFalsa(base([plan('p')]) as never, { fallaEn: 'hitl_queue' } as never).db as never, { dry_run: true }, new Date('2026-11-05T12:00:00Z'))
    expect(r.status).toBe(502)
  })
})
