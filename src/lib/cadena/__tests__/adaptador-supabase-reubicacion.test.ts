/**
 * 10-nov · 🟡 CC7 punto 1 sobre #1014 · el ADAPTADOR real de las filas que quedaron atrás (lo que la base en memoria no ve):
 *   (a) `reubicarFila` escribe SOLO si la fila sigue sin producir: la condición va en la lectura Y en la escritura (otra vía que la tomó gana)
 *   (b) `abrirMesaDeReubicacionReal` le pasa a la oficina el sobre con SU `dry_run` (una campaña en ensayo nunca gasta)
 * Base, oficina y sala simuladas: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Consulta { tabla: string; llamadas: Array<[string, ...unknown[]]> }
const consultas: Consulta[] = []
let lectura: { avisos: string[] | null } | null = null
let actualizadas: Array<{ id: string }> = []

function consulta(tabla: string) {
  const c: Consulta = { tabla, llamadas: [] }
  consultas.push(c)
  const q: any = {}
  for (const m of ['select', 'eq', 'in', 'lt', 'limit', 'order', 'update', 'insert', 'upsert']) q[m] = (...a: unknown[]) => { c.llamadas.push([m, ...a]); return q }
  q.maybeSingle = async () => { c.llamadas.push(['maybeSingle']); return { data: lectura, error: null } }
  q.then = (ok: (v: unknown) => unknown) => ok({ data: c.llamadas.some(([m]) => m === 'update') ? actualizadas : [], error: null })
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))

// la oficina: la validación del sobre es la REAL; lo que abre la mesa guarda el sobre que recibe
const abiertos: Array<Record<string, any>> = []
const despertados: unknown[] = []
let respuestaDeLaOficina: { status: number; cuerpo: Record<string, unknown> } = { status: 200, cuerpo: { encargo_id: 'enc-1', accion: 'esperar', turno: { n: 1 } } }
vi.mock('@/lib/oficina/ruta', () => ({ entornoConBase: (b: string) => ({ baseUrl: b }) }))
vi.mock('@/lib/oficina/adaptadores', () => ({ crearPuertos: () => ({ puertos: true }) }))
vi.mock('@/lib/oficina/orquestador', () => ({ avanzar: async () => ({}) }))
vi.mock('@/lib/oficina/despertar', () => ({ despertarAlFlujoDeLaOficina: async (_f: unknown, _e: unknown, id: string) => { despertados.push(id) } }))
vi.mock('@/lib/oficina/mesa/de-la-cadena', async (importar) => {
  const real = await importar<typeof import('@/lib/oficina/mesa/de-la-cadena')>()
  return { ...real, abrirMesaDeLaCadena: async (_P: unknown, sobre: Record<string, any>) => { abiertos.push(structuredClone(sobre)); return respuestaDeLaOficina } }
})

import { abrirMesaDeReubicacionReal, almacenDeSupabase } from '../almacen-supabase'
import type { SobreDeReubicacion } from '../reubicar'

const SIN_PRODUCIR = ['validada', 'lista_para_brief']
const tieneLaCondicion = (c: Consulta) => c.llamadas.some(([m, col, v]) => m === 'in' && col === 'estado' && JSON.stringify(v) === JSON.stringify(SIN_PRODUCIR))
const filtros = (c: Consulta) => c.llamadas.filter(([m]) => m === 'eq').map(([, col, v]) => `${col}=${v}`)

beforeEach(() => { consultas.length = 0; abiertos.length = 0; despertados.length = 0; lectura = { avisos: ['antes'] }; actualizadas = [{ id: 'f1' }]; respuestaDeLaOficina = { status: 200, cuerpo: { encargo_id: 'enc-1', accion: 'esperar', turno: { n: 1 } } } })

describe('adaptador · reubicarFila escribe solo si la fila sigue sin producir (a)', () => {
  it('🔴 la condición «sigue sin producir» va en la LECTURA y en la ESCRITURA, con la campaña, la versión y la fila; suma el aviso', async () => {
    expect(await almacenDeSupabase().reubicarFila('camp-1', 3, 'f1', { fecha: '2026-11-20' }, 'reubicación: x')).toBe(true)
    const [leer, escribir] = consultas.filter((c) => c.tabla === 'cadena_calendario_filas')
    expect(tieneLaCondicion(leer)).toBe(true)
    expect(tieneLaCondicion(escribir)).toBe(true)
    for (const c of [leer, escribir]) expect(filtros(c)).toEqual(['campana_id=camp-1', 'calendario_version=3', 'id=f1'])
    const up = escribir.llamadas.find(([m]) => m === 'update')!
    expect(up[1]).toEqual({ fecha: '2026-11-20', avisos: ['antes', 'reubicación: x'] })
    // devuelve las filas tocadas: sin `.select` no sabría si la escritura condicional aplicó
    expect(escribir.llamadas.some(([m, col]) => m === 'select' && col === 'id')).toBe(true)
  })
  it('🔴 si otra vía tomó la fila entre la lectura y la escritura (la escritura condicional no toca filas), devuelve false', async () => {
    actualizadas = []
    expect(await almacenDeSupabase().reubicarFila('camp-1', 3, 'f1', { estado: 'perdio_su_fecha' }, 'reubicación: y')).toBe(false)
  })
  it('🔴 si la fila ya no está sin producir al leerla, no escribe nada', async () => {
    lectura = null
    expect(await almacenDeSupabase().reubicarFila('camp-1', 3, 'f1', { estado: 'cancelada' }, 'reubicación: z')).toBe(false)
    expect(consultas.filter((c) => c.tabla === 'cadena_calendario_filas')).toHaveLength(1)
    expect(consultas.some((c) => c.llamadas.some(([m]) => m === 'update'))).toBe(false)
  })
})

describe('adaptador · la mesa de reubicación recibe el sobre con SU dry_run (b)', () => {
  const sobre = (dry_run: boolean): SobreDeReubicacion => ({ tipo_de_mesa: 'reubicacion', client_id: '11111111-1111-4111-8111-aaaaaaaaaaaa', campana_id: '00000000-0000-4000-8000-aaaaaaaaaaaa', version: 2, dry_run, marco_texto: '# Filas que quedaron atrás sin producir\n- f1', condiciones: [] })
  it('🔴 en ensayo llega dry_run: true; en real, false (nunca se fuerza)', async () => {
    for (const d of [true, false]) {
      abiertos.length = 0
      expect(await abrirMesaDeReubicacionReal(sobre(d))).toEqual({ estado: 'abierta', encargo_id: 'enc-1' })
      expect(abiertos).toHaveLength(1)
      expect(abiertos[0]).toMatchObject({ tipo_de_mesa: 'reubicacion', dry_run: d, version: 2, campana_id: '00000000-0000-4000-8000-aaaaaaaaaaaa' })
    }
    expect(despertados).toEqual(['enc-1', 'enc-1'])
  })
  it('la oficina que no abre (409/404) es `no_abre`; otra respuesta, `error`; un sobre inválido no llega a la oficina', async () => {
    respuestaDeLaOficina = { status: 409, cuerpo: { error: 'plantilla_inactiva' } }
    expect(await abrirMesaDeReubicacionReal(sobre(true))).toEqual({ estado: 'no_abre', motivo: 'plantilla_inactiva' })
    respuestaDeLaOficina = { status: 500, cuerpo: { error: 'x' } }
    expect((await abrirMesaDeReubicacionReal(sobre(true))).estado).toBe('error')
    abiertos.length = 0
    expect((await abrirMesaDeReubicacionReal({ ...sobre(true), marco_texto: '' })).estado).toBe('error')
    expect(abiertos).toEqual([])
  })
})

describe('adaptador · 11-nov #1014 · relectura: el estado de partida y el texto guardado', () => {
  it('🔴 con `desde` la condición de la LECTURA y de la ESCRITURA es ese estado (perdio_su_fecha), no «sin producir»', async () => {
    expect(await almacenDeSupabase().reubicarFila('camp-1', 3, 'f1', { estado: 'validada', fecha: '2026-12-07' }, 'reubicación: r', ['perdio_su_fecha'])).toBe(true)
    const [leer, escribir] = consultas.filter((c) => c.tabla === 'cadena_calendario_filas')
    for (const c of [leer, escribir]) {
      expect(c.llamadas.some(([m, col, v]) => m === 'in' && col === 'estado' && JSON.stringify(v) === JSON.stringify(['perdio_su_fecha']))).toBe(true)
      expect(tieneLaCondicion(c)).toBe(false)
    }
  })
  it('🔴 el texto guardado lo lee la OFICINA (la cadena no nombra sus tablas): pasa el texto y el id; sin texto, null (nunca lanza)', async () => {
    lectura = { estado_del_motor: { artefactos: { mesa: { datos: { pieza_texto: 'f1 · reubicar · 2026-12-07 · r' } } } } } as never
    expect(await almacenDeSupabase().textoGuardadoDeLaMesa!('enc-9')).toBe('f1 · reubicar · 2026-12-07 · r')
    expect(consultas.length).toBeGreaterThan(0)
    expect(filtros(consultas[consultas.length - 1])).toEqual(['id=enc-9'])
    lectura = null
    expect(await almacenDeSupabase().textoGuardadoDeLaMesa!('enc-9')).toBeNull()
  })
})
