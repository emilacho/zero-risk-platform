/**
 * 16-nov · Sprint 1 · Mejora 2 (CC1) · condición 4 de CC6 · el ADAPTADOR real guarda el concepto de la fila y un segundo guardado no lo borra.
 *  · `guardarFilas` manda `concepto` SIEMPRE (null si la fila no lo trae: nunca «undefined», que el upsert ignoraría y dejaría el viejo).
 *  · leer → guardar otra vez (otro estado) → el concepto sigue ahí.
 * Base simulada en memoria (una tabla con su clave campaña + versión + id): US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tabla = new Map<string, Record<string, unknown>>()
const upserts: Array<Record<string, unknown>[]> = []
const clave = (r: Record<string, unknown>) => `${r.campana_id}|${r.calendario_version}|${r.id}`

function consulta() {
  const filtros: Array<[string, unknown]> = []
  const q: any = {}
  q.select = () => q
  q.limit = () => q
  q.eq = (col: string, v: unknown) => { filtros.push([col, v]); return q }
  q.upsert = (filas: Record<string, unknown>[]) => {
    upserts.push(structuredClone(filas))
    // como Postgres: una columna que no viene en el objeto conserva su valor; la que viene (aunque sea null) se pisa
    for (const f of filas) tabla.set(clave(f), { ...(tabla.get(clave(f)) ?? {}), ...structuredClone(f) })
    return Promise.resolve({ data: null, error: null })
  }
  q.then = (ok: (v: unknown) => unknown) => ok({ data: [...tabla.values()].filter((r) => filtros.every(([c, v]) => r[c] === v)).map((r) => structuredClone(r)), error: null })
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => consulta() }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))

import { almacenDeSupabase } from '../almacen-supabase'
import type { Fila } from '../tipos'

const CONCEPTO = { idea: 'la silla que espera', que_se_ve: 'una silla junto a la mesa larga', mensaje: 'siempre hay una silla para ti', emocion: 'bienvenida' }
const fila = (o: Partial<Fila> & { id: string }): Fila => ({
  tanda: 1, semana: 1, dia_semana: 1, fecha: '2026-11-17', hora: '09:00', red: 'instagram', formato: 'carrusel', pilar: 'menu', tema: 't', sede: 'centro',
  requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'patron', estado: 'propuesta', avisos: [], ...o,
} as unknown as Fila)

beforeEach(() => { tabla.clear(); upserts.length = 0 })

describe('adaptador · el concepto de la fila se guarda y sobrevive a otro guardado', () => {
  it('la fila con concepto lo manda; la que no lo trae manda null explícito (la clave está, no «undefined»)', async () => {
    await almacenDeSupabase().guardarFilas('camp-1', 1, 1, [fila({ id: 'f1', concepto: CONCEPTO }), fila({ id: 'f2' })], false)
    const [f1, f2] = upserts[0]
    expect(f1.concepto).toEqual(CONCEPTO)
    expect('concepto' in f2).toBe(true)
    expect(f2.concepto).toBeNull()
  })
  it('leer → guardar otra vez con otro estado → el concepto sigue igual', async () => {
    const al = almacenDeSupabase()
    await al.guardarFilas('camp-1', 1, 1, [fila({ id: 'f1', concepto: CONCEPTO })], false)
    const leidas = await al.filas('camp-1', 1)
    expect(leidas[0].concepto).toEqual(CONCEPTO)
    await al.guardarFilas('camp-1', 1, 1, leidas.map((f) => ({ ...f, estado: 'validada' as const })), false)
    const otra = await al.filas('camp-1', 1)
    expect(otra[0].estado).toBe('validada')
    expect(otra[0].concepto).toEqual(CONCEPTO)
  })
})
