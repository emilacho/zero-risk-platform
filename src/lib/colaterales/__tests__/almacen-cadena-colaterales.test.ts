/**
 * Colaterales · tramo 2c · los DOS métodos nuevos del almacén REAL de la cadena (los que usa el escritor de la estrategia).
 * Base simulada: US$ 0, sin red. Las columnas que se escriben se comparan con la migración real de `cadena_estrategias`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const escrituras: Array<{ tabla: string; fila: Record<string, any> }> = []
const filtros: Array<[string, unknown]> = []
let errorAlInsertar: { message: string; code: string } | null = null
let filasLeidas: unknown[] = []

function consulta(tabla: string) {
  const q: any = {
    select: () => q, order: () => q, limit: () => q,
    eq: (k: string, v: unknown) => { filtros.push([k, v]); return q },
    insert: (fila: Record<string, any>) => { escrituras.push({ tabla, fila }); return { then: (ok: (v: unknown) => unknown) => ok({ data: null, error: errorAlInsertar }) } },
    then: (ok: (v: unknown) => unknown) => ok({ data: filasLeidas, error: null }),
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({}), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))

import { almacenDeSupabase } from '../../cadena/almacen-supabase'
import type { EstrategiaGuardada } from '../../cadena/almacen'

const COLUMNAS = (() => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202610090200_cadena_tablas.sql'), 'utf8').split(String.fromCharCode(13)).join('')
  const m = /CREATE TABLE IF NOT EXISTS public\.cadena_estrategias \(([\s\S]*?)\n\);/i.exec(sql)!
  return new Set(m[1].split('\n').map((l) => l.trim()).filter((l) => l && !/^constraint/i.test(l)).map((l) => l.split(/\s+/)[0]))
})()
const NUEVA: EstrategiaGuardada = { campana_id: 'c', version: 2, estado: 'validada', contenido: { fases: [] } as unknown as EstrategiaGuardada['contenido'], agente: 'colaterales', modelo: null, costo_usd: 0, workflow_execution_id: null, seco: false }

beforeEach(() => { escrituras.length = 0; filtros.length = 0; errorAlInsertar = null; filasLeidas = [] })

describe('almacén real de la cadena · métodos de colaterales', () => {
  it('insertarEstrategiaSiLibre: true si guarda; escribe SOLO columnas que la migración crea', async () => {
    expect(await almacenDeSupabase().insertarEstrategiaSiLibre(NUEVA)).toBe(true)
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0].tabla).toBe('cadena_estrategias')
    for (const k of Object.keys(escrituras[0].fila)) expect(COLUMNAS.has(k), k).toBe(true)
  })

  it('insertarEstrategiaSiLibre: false ante la versión repetida (23505); cualquier otro error se LANZA', async () => {
    errorAlInsertar = { message: 'duplicate key value violates unique constraint "cadena_estrategias_version"', code: '23505' }
    expect(await almacenDeSupabase().insertarEstrategiaSiLibre(NUEVA)).toBe(false)
    errorAlInsertar = { message: 'connection reset', code: '08006' }
    await expect(almacenDeSupabase().insertarEstrategiaSiLibre(NUEVA)).rejects.toThrow(/connection reset/)
  })

  it('estrategiaEnVersion filtra por campaña Y versión exacta; sin fila devuelve null', async () => {
    filasLeidas = [NUEVA]
    expect(await almacenDeSupabase().estrategiaEnVersion('c', 2)).toEqual(NUEVA)
    expect(filtros).toEqual([['campana_id', 'c'], ['version', 2]])
    filasLeidas = []
    expect(await almacenDeSupabase().estrategiaEnVersion('c', 9)).toBeNull()
  })
})
