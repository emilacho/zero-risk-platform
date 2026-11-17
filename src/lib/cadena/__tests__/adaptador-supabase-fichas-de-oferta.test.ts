/**
 * 17-nov · Sprint 4 · A entrega 2 · el ADAPTADOR real de las fichas (lo que la base en memoria no ve):
 *   (1) el código puede publicarse ANTES que la migración: leer con la tabla ausente = «sin fichas» (no rompe el calendario ni la hoja)
 *   (2) cualquier OTRO error de la base al leer falla ruidoso; escribir con la tabla ausente también
 *   (3) se lee la última versión de ESA campaña; una inserción repetida (23505) no rompe (la primera que cierra gana)
 * Base simulada: US$ 0, sin red.
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
import type { FichasGuardadas } from '../almacen'

const T = 'cadena_fichas_de_oferta'
const guardadas = (campana_id: string, version: number): FichasGuardadas => ({
  campana_id, version, estado: 'validada', contenido: [{ clave: `of-${version}` }], pendientes: [], descartados: 0, agente: 'x', modelo: null, costo_usd: null, workflow_execution_id: null, seco: true,
})
beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k]
  for (const k of Object.keys(errorEn)) delete errorEn[k]
  insertadas.length = 0
})

describe('el adaptador real de las fichas', () => {
  it('🔴 tabla ausente (migración aún no aplicada) al leer = null, en sus dos formas (Postgres y PostgREST)', async () => {
    const al = almacenDeSupabase()
    for (const code of ['42P01', 'PGRST205']) {
      errorEn[T] = { code, message: 'no existe' }
      await expect(al.ultimasFichas!('c1')).resolves.toBeNull()
    }
  })
  it('🔴 cualquier otro error al leer falla ruidoso; escribir con la tabla ausente también', async () => {
    const al = almacenDeSupabase()
    errorEn[T] = { code: '42501', message: 'permiso denegado' }
    await expect(al.ultimasFichas!('c1')).rejects.toThrow(/permiso denegado/)
    errorEn[T] = { code: '42P01', message: 'no existe la tabla' }
    await expect(al.insertarFichas!(guardadas('c1', 1))).rejects.toThrow(/no existe la tabla/)
  })
  it('lee la última versión de ESA campaña; una inserción repetida (23505) no rompe', async () => {
    const al = almacenDeSupabase()
    tablas[T] = [guardadas('c1', 1), guardadas('c1', 2), guardadas('c2', 9)] as unknown as Fila[]
    expect((await al.ultimasFichas!('c1'))?.version).toBe(2)
    expect(await al.ultimasFichas!('c3')).toBeNull()
    errorEn[T] = { code: '23505', message: 'repetida' }
    await expect(al.insertarFichas!(guardadas('c1', 1))).resolves.toBeUndefined()
    delete errorEn[T]
    await al.insertarFichas!(guardadas('c4', 1))
    expect(insertadas.map((x) => x.tabla)).toEqual([T])
  })
})
