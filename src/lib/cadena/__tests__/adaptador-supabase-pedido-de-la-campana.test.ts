/**
 * 20-nov · «Crear Campaña» · entrega 3 · el ADAPTADOR real del pedido del dueño (lo que la base en memoria no ve):
 *   la tabla de CC1 (`cadena_pedidos_de_campana`) se lee por `campana_id`; con la tabla ausente (migración aún no aplicada) = sin pedido;
 *   cualquier OTRO error falla ruidoso (la cadena no sigue sin el brief de la campaña en silencio). Base simulada: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Fila = Record<string, unknown>
const tablas: Record<string, Fila[]> = {}
const errorEn: Record<string, { code: string; message: string } | undefined> = {}
const insertadas: Array<{ tabla: string; fila: Fila }> = []
function consulta(tabla: string) {
  const filtros: Array<(f: Fila) => boolean> = []
  let orden: string | null = null, lim = Infinity
  const correr = () => {
    const e = errorEn[tabla]
    if (e) return { data: null, error: e }
    let filas = (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))
    if (orden) filas = [...filas].sort((a, b) => Number(b[orden!]) - Number(a[orden!]))
    return { data: filas.slice(0, lim), error: null }
  }
  const q: any = {
    select: () => q,
    eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q },
    order: (c: string) => { orden = c; return q },
    limit: (n: number) => { lim = n; return q },
    maybeSingle: async () => { const r = correr(); return r.error ? r : { data: (r.data as Fila[])[0] ?? null, error: null } },
    insert: async (f: Fila) => { const e = errorEn[tabla]; if (e) return { error: e }; insertadas.push({ tabla, fila: f }); return { error: null } },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(correr()).then(ok, ko),
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))
vi.mock('@/lib/avisos/nucleo', () => ({ avisar: async () => ({ accion: 'abrio', slack: 'no' }) }))
vi.mock('@/lib/avisos/adaptadores', () => ({ dependenciasReales: () => ({}) }))

import { almacenDeSupabase } from '../almacen-supabase'

const T = 'cadena_pedidos_de_campana'
const fila = (campana_id: string, brief_libre: string) => ({ campana_id, client_id: 'c1', llave: 'll-' + campana_id, nombre: 'N', cambio: 'C', fecha_inicio: null, fecha_fin: null, fechas_clave: [], tope_usd: 30, brief_libre })
beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k]
  for (const k of Object.keys(errorEn)) delete errorEn[k]
  insertadas.length = 0
})

describe('el adaptador real del pedido del dueño', () => {
  it('lee el pedido de ESA campaña (no el de otra del mismo cliente)', async () => {
    tablas[T] = [fila('camp-1', 'brief uno'), fila('camp-2', 'brief dos')]
    const al = almacenDeSupabase()
    expect((await al.pedidoDeLaCampana!('camp-2'))?.brief_libre).toBe('brief dos')
    expect((await al.pedidoDeLaCampana!('camp-1'))?.brief_libre).toBe('brief uno')
    expect(await al.pedidoDeLaCampana!('camp-3')).toBeNull()
  })
  it('tabla ausente, en sus dos formas = sin pedido; otro error = falla', async () => {
    const al = almacenDeSupabase()
    for (const code of ['42P01', 'PGRST205']) {
      errorEn[T] = { code, message: 'no existe la tabla' }
      expect(await al.pedidoDeLaCampana!('camp-1')).toBeNull()
    }
    errorEn[T] = { code: '57014', message: 'tiempo agotado' }
    await expect(al.pedidoDeLaCampana!('camp-1')).rejects.toThrow('tiempo agotado')
  })
})
