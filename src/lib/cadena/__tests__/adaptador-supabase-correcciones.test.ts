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
  let orden: { col: string; asc: boolean } | null = null
  q.order = (col: string, o?: { ascending?: boolean }) => { orden = { col, asc: o?.ascending !== false }; return q }
  q.limit = (n: number) => { tope = n; return q }
  q.eq = (col: string, v: unknown) => { filtros.push((r) => r[col] === v); return q }
  q.neq = (col: string, v: unknown) => { filtros.push((r) => r[col] !== v); return q }
  q.contains = (col: string, v: unknown[]) => { filtros.push((r) => v.every((x) => ((r[col] as unknown[]) ?? []).includes(x))); return q }
  q.is = (col: string, v: unknown) => { filtros.push((r) => (r[col] ?? null) === v); return q }
  q.update = (p: Record<string, unknown>) => { cambio = p; return q }
  q.insert = (p: Record<string, unknown>) => { alta = p; return q }
  q.then = (ok: (v: unknown) => unknown) => {
    if (alta) {
      if (filas.some((r) => r.llave === alta!.llave)) return ok({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "cadena_correcciones_llave_key"' } })
      filas.push(structuredClone(alta))
      return ok({ data: [structuredClone(alta)], error: null })
    }
    const todas = filas.filter((r) => filtros.every((f) => f(r)))
    if (orden) { const { col, asc } = orden; todas.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1)) }
    const sel = todas.slice(0, tope)
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

const base = { campana_id: 'c', fila_id: 'f', destino: 'calendario', dura: true, intentos: 1, explicacion: null, alarma_en: null, frena: false, respondida_en: '2026-11-17T19:00:00Z' }
beforeEach(() => {
  filas = [
    { ...base, llave: 'a:calendario', estado: 'en_manos_del_creador', respuesta: null },
    { ...base, llave: 'b:calendario', estado: 'recibida', respuesta: null },
    { ...base, llave: 'c:calendario', estado: 'respondida', respuesta: 'no_dicha', alarma_en: null, frena: true },
    { ...base, llave: 'd:calendario', estado: 'respondida', respuesta: 'no_dicha', alarma_en: '2026-11-17T20:00:00Z', frena: true },
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
  it('🔴 a2 · las alarmas pendientes son SOLO las FRENADAS cerradas que todavía no se avisaron', async () => {
    const al = almacenDeSupabase()
    expect((await al.alarmasPendientes!()).map((c) => c.llave)).toEqual(['c:calendario'])
  })
  it('🔴 🟡 CC6 22:00 · 60 duras tomadas que no frenan NO tapan el reintento de la frenada (filtra por «frena», las más viejas primero)', async () => {
    for (let i = 0; i < 60; i++) filas.push({ ...base, llave: `t${i}:calendario`, estado: 'respondida', respuesta: 'tomada', alarma_en: null, frena: false, respondida_en: '2026-11-17T18:00:00Z' })
    filas.push({ ...base, llave: 'z:calendario', estado: 'respondida', respuesta: 'no_dicha', alarma_en: null, frena: true, respondida_en: '2026-11-17T21:00:00Z' })
    const al = almacenDeSupabase()
    expect((await al.alarmasPendientes!()).map((c) => c.llave)).toEqual(['c:calendario', 'z:calendario'])
  })
  it('🔴 con más de 50 frenadas esperando, salen primero las MÁS VIEJAS (no las que la base devuelva primero)', async () => {
    filas = []
    for (let i = 59; i >= 0; i--) filas.push({ ...base, llave: `f${String(i).padStart(2, '0')}:calendario`, estado: 'respondida', respuesta: 'no_dicha', frena: true, respondida_en: `2026-11-17T${String(10 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}:00Z` })
    const al = almacenDeSupabase()
    const r = (await al.alarmasPendientes!()).map((c) => c.llave)
    expect(r).toHaveLength(50)
    expect(r[0]).toBe('f00:calendario')
    expect(r).not.toContain('f59:calendario')
  })
  it('🔴 CC7 · las del encargo incluyen las que lo CUBREN (otro encargo de la misma fila), sin repetir', async () => {
    filas.push({ ...base, llave: 'h:calendario', encargo_id: 'enc-1', encargos_cubiertos: ['enc-2'], estado: 'en_manos_del_creador', respuesta: null })
    filas.push({ ...base, llave: 'h:banco', encargo_id: 'enc-2', encargos_cubiertos: ['enc-2'], estado: 'recibida', respuesta: null })
    const al = almacenDeSupabase()
    expect((await al.correccionesDeEncargo!('enc-2')).map((c) => c.llave).sort()).toEqual(['h:banco', 'h:calendario'])
    expect((await al.correccionesDeEncargo!('enc-1')).map((c) => c.llave)).toEqual(['h:calendario'])
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
