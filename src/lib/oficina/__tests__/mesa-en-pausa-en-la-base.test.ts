/**
 * 24-nov · retomar donde se cayó · el ADAPTADOR real (Supabase), no la memoria: `mesaEnPausa` lee el encargo de la oficina y solo dice «en pausa» si el encargo
 * sigue `en_paso` y su mesa guarda una `pausa_externa`. Un encargo cerrado (aunque arrastre la marca), sin marca o inexistente: no. Un error de la base: LANZA
 * (el reloj lo atrapa y vence como siempre). Base simulada en memoria: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tablas: Record<string, Array<Record<string, unknown>>> = { oficina_encargos: [] }
let romper = false
const pedidas: Array<{ tabla: string; columnas: string }> = []

function consulta(nombre: string) {
  const filtros: Array<(r: Record<string, unknown>) => boolean> = []
  let columnas = '*'
  const q: any = {}
  q.select = (c: string) => { columnas = c; return q }
  q.eq = (col: string, v: unknown) => { filtros.push((r) => r[col] === v); return q }
  q.limit = () => q
  q.maybeSingle = () => q
  q.then = (ok: (v: unknown) => unknown) => {
    pedidas.push({ tabla: nombre, columnas })
    if (romper) return ok({ data: null, error: { message: 'la base no contestó' } })
    const filas = (tablas[nombre] ?? []).filter((r) => filtros.every((f) => f(r)))
    return ok({ data: filas[0] ? structuredClone(filas[0]) : null, error: null })
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))

import { almacenDeSupabase } from '../../cadena/almacen-supabase'

const PAUSA = { causa: 'saldo', motivo: 'Credit balance is too low', agente: 'director-gran-idea', tipo: 'integrar', paso: 'mesa:integrar:director-gran-idea', n: 26, en: '2026-11-24T04:14:00Z' }
const encargo = (id: string, estado: string, pausa: unknown) => ({ id, estado, estado_del_motor: { gasto_usd: 10.25, artefactos: { mesa: { version: 3, datos: { fase: 'trabajando', ...(pausa === undefined ? {} : { pausa_externa: pausa }) } } } } })

beforeEach(() => {
  romper = false
  pedidas.length = 0
  tablas.oficina_encargos = [
    encargo('en-pausa', 'en_paso', PAUSA),
    encargo('trabajando', 'en_paso', undefined),
    encargo('pausa-levantada', 'en_paso', null),
    encargo('cerrado-con-marca', 'cerrado', PAUSA),
    { id: 'sin-motor', estado: 'en_paso', estado_del_motor: null },
  ]
})

describe('mesaEnPausa en la base real', () => {
  it('en_paso con la pausa guardada: sí', async () => {
    expect(await almacenDeSupabase().mesaEnPausa!('en-pausa')).toBe(true)
    expect(pedidas).toEqual([{ tabla: 'oficina_encargos', columnas: 'estado, estado_del_motor' }])
  })
  it('trabajando, con la pausa levantada (null), sin motor o inexistente: no', async () => {
    const al = almacenDeSupabase()
    for (const id of ['trabajando', 'pausa-levantada', 'sin-motor', 'no-existe']) expect(await al.mesaEnPausa!(id)).toBe(false)
  })
  it('un encargo cerrado que arrastra la marca: no (el reloj lo puede vencer)', async () => {
    expect(await almacenDeSupabase().mesaEnPausa!('cerrado-con-marca')).toBe(false)
  })
  it('la base falla: LANZA (no inventa un «no está en pausa» ni un «sí»)', async () => {
    romper = true
    await expect(almacenDeSupabase().mesaEnPausa!('en-pausa')).rejects.toThrow()
  })
})
