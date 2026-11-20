/**
 * 21-nov · CC7 sobre #1259 (s1 · s4 · s5 · s6) · el ADAPTADOR real de «Crear Campaña»: lo que la base en memoria no ve.
 *   · `pedidoPorLlave` filtra por cliente, seco Y llave (un pedido en seco no lo usa una apertura de verdad);
 *   · `planAprobado` solo dice sí al plan de 90 días con `status = 'approved'` (un borrador no);
 *   · `costosDelMinimo` lleva las reservas de las familias y la política de la clase `registro` (no otra).
 * Base simulada: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Fila = Record<string, unknown>
const tablas: Record<string, Fila[]> = {}
const llamadas: Array<{ tabla: string; op: string; args: unknown[] }> = []
function consulta(tabla: string) {
  const filtros: Array<(f: Fila) => boolean> = []
  const correr = () => ({ data: (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))), error: null })
  const q: any = {
    select: (...a: unknown[]) => { llamadas.push({ tabla, op: 'select', args: a }); return q },
    update: (...a: unknown[]) => { llamadas.push({ tabla, op: 'update', args: a }); return q },
    eq: (c: string, v: unknown) => { llamadas.push({ tabla, op: 'eq', args: [c, v] }); filtros.push((f) => f[c] === v); return q },
    is: (c: string, v: unknown) => { llamadas.push({ tabla, op: 'is', args: [c, v] }); filtros.push((f) => (f[c] ?? null) === v); return q },
    maybeSingle: async () => ({ data: correr().data[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(correr()).then(ok, ko),
  }
  return q
}
const politicaPedida: string[] = []
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/jefatura/revision/almacen-supabase', () => ({
  almacenDeSupabase: () => ({ leerPolitica: async (clase: string) => { politicaPedida.push(clase); return clase === 'registro' ? { ok: true, politica: { tope_revision_usd: 0.8 } } : { ok: true, politica: { tope_revision_usd: 9 } } } }),
  revisionesDeRegistroDeLaCampana: async () => [],
}))
vi.mock('@/lib/oficina/gasto-de-encargos', async (orig) => ({
  ...(await orig<typeof import('@/lib/oficina/gasto-de-encargos')>()),
  topesDeFamiliasActivas: async () => ({ post_img: 2.5, carrusel_mesa: 5 }),
  reservasDeFamiliasActivas: async () => ({ carrusel_mesa: 3.1 }),
}))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))
vi.mock('@/lib/avisos/nucleo', () => ({ avisar: async () => ({ accion: 'abrio', slack: 'no' }) }))
vi.mock('@/lib/avisos/adaptadores', () => ({ dependenciasReales: () => ({}) }))

import { almacenDeSupabase } from '../almacen-supabase'

const T = 'cadena_pedidos_de_campana'
const pedido = (o: Fila) => ({ id: 'p1', client_id: 'c1', seco: false, llave: 'crear-x', nombre: 'N', cambio: 'C', fecha_inicio: null, fecha_fin: null, fechas_clave: [], tope_usd: '30.00', brief_libre: 'B', pedido_por: 'emilio', creado_en: '2026-11-21T00:00:00Z', campana_id: null, ...o })
beforeEach(() => { for (const k of Object.keys(tablas)) delete tablas[k]; llamadas.length = 0; politicaPedida.length = 0 })

describe('el adaptador real de «Crear Campaña»', () => {
  it('🔴 s1 · pedidoPorLlave filtra por cliente, seco y llave: el pedido en seco no lo ve una apertura de verdad', async () => {
    tablas[T] = [pedido({ id: 'p-seco', seco: true }), pedido({ id: 'p-otro', client_id: 'c2' })]
    const al = almacenDeSupabase()
    expect(await al.pedidoPorLlave!('c1', 'crear-x', false)).toBeNull()
    const p = await al.pedidoPorLlave!('c1', 'crear-x', true)
    expect(p).toMatchObject({ id: 'p-seco', seco: true, tope_usd: 30 })
    expect(llamadas.filter((l) => l.tabla === T && l.op === 'eq').map((l) => l.args[0]).sort()).toEqual(['client_id', 'client_id', 'llave', 'llave', 'seco', 'seco'])
  })
  it('🔴 s4 · planAprobado: solo el plan de 90 días aprobado; un borrador o un plan de otro tipo, no', async () => {
    tablas.client_historical_outputs = [
      { id: 'pl-ok', output_type: 'campaign_plan_90d', status: 'approved' },
      { id: 'pl-borrador', output_type: 'campaign_plan_90d', status: 'draft' },
      { id: 'pl-otro', output_type: 'brand_book', status: 'approved' },
    ]
    const al = almacenDeSupabase()
    expect(await al.planAprobado!('pl-ok')).toBe(true)
    expect(await al.planAprobado!('pl-borrador')).toBe(false)
    expect(await al.planAprobado!('pl-otro')).toBe(false)
    expect(await al.planAprobado!('no-existe')).toBe(false)
  })
  it('🔴 s5 · s6 · costosDelMinimo lleva las reservas y la política de la clase «registro»', async () => {
    const c = await almacenDeSupabase().costosDelMinimo!()
    expect(c).toEqual({ topes: { post_img: 2.5, carrusel_mesa: 5 }, reservas: { carrusel_mesa: 3.1 }, tope_registro_usd: 0.8 })
    expect(politicaPedida).toEqual(['registro'])
  })
  it('🔴 ligar: solo un pedido SIN campaña (filtro `campana_id is null`); uno ya ligado lanza', async () => {
    tablas[T] = [pedido({ id: 'p1', campana_id: null }), pedido({ id: 'p2', llave: 'crear-y', campana_id: 'camp-otra' })]
    const al = almacenDeSupabase()
    await expect(al.ligarPedidoDeCampana!('p1', 'camp-1')).resolves.toBeUndefined()
    expect(llamadas.find((l) => l.tabla === T && l.op === 'update')?.args[0]).toEqual({ campana_id: 'camp-1' })
    expect(llamadas.some((l) => l.tabla === T && l.op === 'is' && l.args[0] === 'campana_id' && l.args[1] === null)).toBe(true)
    await expect(al.ligarPedidoDeCampana!('p2', 'camp-1')).rejects.toThrow(/ya estaba ligado/)
  })
})
