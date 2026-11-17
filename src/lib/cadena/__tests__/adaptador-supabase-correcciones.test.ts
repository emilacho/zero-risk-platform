/**
 * 17-nov · 🟡 CC6 #1150 (a1 · a2 · a3) · el ADAPTADOR real de `cadena_correcciones`: los filtros que hacen que en producción
 *   · la escritura sea CONDICIONAL al estado (dos vigías no abren dos mesas · una respuesta no cierra encima de otra),
 *   · las alarmas ya avisadas NO vuelvan a salir en cada vuelta (una por incidente),
 *   · las respondidas no se recorran otra vez.
 * Base simulada que aplica eq / neq / is / insert como Postgres: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let filas: Array<Record<string, unknown>> = []
function consulta() {
  const filtros: Array<(r: Record<string, unknown>) => boolean> = []
  let cambio: Record<string, unknown> | null = null
  let alta: Record<string, unknown> | null = null
  let tope = Infinity
  const q: any = {}
  q.select = () => q
  q.order = () => q
  q.limit = (n: number) => { tope = n; return q }
  q.eq = (col: string, v: unknown) => { filtros.push((r) => r[col] === v); return q }
  q.neq = (col: string, v: unknown) => { filtros.push((r) => r[col] !== v); return q }
  q.is = (col: string, v: unknown) => { filtros.push((r) => (r[col] ?? null) === v); return q }
  q.update = (p: Record<string, unknown>) => { cambio = p; return q }
  q.insert = (p: Record<string, unknown>) => { alta = p; return q }
  q.then = (ok: (v: unknown) => unknown) => {
    if (alta) {
      if (filas.some((r) => r.llave === alta!.llave)) return ok({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "cadena_correcciones_llave_key"' } })
      filas.push(structuredClone(alta))
      return ok({ data: [structuredClone(alta)], error: null })
    }
    const sel = filas.filter((r) => filtros.every((f) => f(r))).slice(0, tope)
    if (cambio) for (const r of sel) Object.assign(r, structuredClone(cambio))
    return ok({ data: sel.map((r) => structuredClone(r)), error: null })
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => consulta() }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))

import { almacenDeSupabase } from '../almacen-supabase'

const base = { campana_id: 'c', fila_id: 'f', destino: 'calendario', dura: true, intentos: 1, explicacion: null, alarma_en: null }
beforeEach(() => {
  filas = [
    { ...base, llave: 'a:calendario', estado: 'en_manos_del_creador', respuesta: null },
    { ...base, llave: 'b:calendario', estado: 'recibida', respuesta: null },
    { ...base, llave: 'c:calendario', estado: 'respondida', respuesta: 'no_dicha', alarma_en: null },
    { ...base, llave: 'd:calendario', estado: 'respondida', respuesta: 'no_dicha', alarma_en: '2026-11-17T20:00:00Z' },
    { ...base, llave: 'e:calendario', estado: 'respondida', respuesta: 'tomada', alarma_en: null },
    { ...base, llave: 'g:calendario', estado: 'respondida', respuesta: 'no_dicha', alarma_en: null, dura: false },
  ]
})

describe('adaptador · cadena_correcciones', () => {
  it('🔴 a1 · la actualización es CONDICIONAL al estado esperado: con otro estado no escribe y devuelve false', async () => {
    const al = almacenDeSupabase()
    expect(await al.correccionActualizar!('a:calendario', { estado: 'respondida', respuesta: 'tomada' }, 'recibida')).toBe(false)
    expect(filas[0]).toMatchObject({ estado: 'en_manos_del_creador', respuesta: null })
    expect(await al.correccionActualizar!('a:calendario', { estado: 'respondida', respuesta: 'tomada' }, 'en_manos_del_creador')).toBe(true)
    expect(filas[0]).toMatchObject({ estado: 'respondida', respuesta: 'tomada' })
    // la segunda vigía (o la segunda respuesta) pierde
    expect(await al.correccionActualizar!('a:calendario', { estado: 'respondida', respuesta: 'no_dicha' }, 'en_manos_del_creador')).toBe(false)
    expect(filas[0].respuesta).toBe('tomada')
  })
  it('🔴 a2 · las alarmas pendientes son SOLO las duras cerradas que todavía no se avisaron (el receptor manda solo las frenadas)', async () => {
    const al = almacenDeSupabase()
    expect((await al.alarmasPendientes!()).map((c) => c.llave)).toEqual(['c:calendario', 'e:calendario'])
  })
  it('🔴 a3 · las pendientes de repartir no incluyen las respondidas', async () => {
    const al = almacenDeSupabase()
    expect((await al.correccionesPendientes!()).map((c) => c.llave).sort()).toEqual(['a:calendario', 'b:calendario'])
  })
  it('la llave repetida no inserta otra: devuelve la que ya estaba', async () => {
    const al = almacenDeSupabase()
    const r = await al.correccionInsertar!({ ...base, llave: 'b:calendario', estado: 'recibida' } as never)
    expect(r.nueva).toBe(false)
    expect(filas.filter((x) => x.llave === 'b:calendario')).toHaveLength(1)
  })
})
