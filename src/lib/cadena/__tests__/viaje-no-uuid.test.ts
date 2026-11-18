/**
 * 18-nov · HALLAZGO CC6 en T7 (`HALLAZGO-CC6-a-CC7-LENOVO-CC3-el-lector-ya-fallo-en-T7`): el lector de fichas llamó con su id de flujo de n8n (`k1IZ5eGfGbUeMQR8`),
 * que faltaba en `flujos`. `autorizarLlamada` preguntó `journeyExiste`, que comparaba ese texto contra `sala_event_log.stream_id` (uuid): Postgres cortó con 22P02
 * y salió el 500 genérico en vez del 403 E-WORKFLOW-DESCONOCIDO. Un id que no es uuid NO es un viaje: el ADAPTADOR real contesta «no existe» sin preguntar.
 * Base falsa que se porta como Postgres con la columna uuid (22P02 si el valor no es uuid): US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Fila = Record<string, unknown>
const tablas: Record<string, Fila[]> = {}
const preguntas: Array<{ tabla: string; filtros: Array<[string, unknown]> }> = []
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** columnas uuid de la base real que toca esta prueba (Postgres rechaza un texto que no es uuid con 22P02) */
const COLUMNAS_UUID: Record<string, string[]> = { sala_event_log: ['stream_id', 'client_id'] }
function consulta(tabla: string) {
  let lim = Infinity
  const filtros: Array<[string, unknown]> = []
  const correr = () => {
    preguntas.push({ tabla, filtros: [...filtros] })
    const malo = filtros.find(([c, v]) => (COLUMNAS_UUID[tabla] ?? []).includes(c) && !(typeof v === 'string' && UUID.test(v)))
    if (malo) return { data: null, error: { message: `invalid input syntax for type uuid: "${String(malo[1])}"`, code: '22P02' } }
    return { data: (tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v)).slice(0, lim), error: null }
  }
  const q: any = {
    select: () => q,
    eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
    limit: (n: number) => { lim = n; return q },
    maybeSingle: async () => { const r = correr(); return { data: r.data?.[0] ?? null, error: r.error } },
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

import { almacenDeSupabase, UUID_DEL_VIAJE } from '../almacen-supabase'
import { autorizarLlamada } from '../autorizar'
import { verificarViaje } from '../campanas'

const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' // Náufrago (real)
const VIAJE = '54c4fe9a-0000-4000-8000-000000000001'
const LECTOR = 'k1IZ5eGfGbUeMQR8' // el id del lector de fichas en n8n (el de T7)
const FLUJOS = ['pBAp5Cx7R39U585i'] // la puerta: el lector NO está (como en T7)
const ex = { workflow_execution_id: '250758' }
const deLaSala = () => preguntas.filter((p) => p.tabla === 'sala_event_log')

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k]
  preguntas.length = 0
  tablas.cadena_config = [{ clave: 'flujos', valor: FLUJOS }]
  tablas.sala_event_log = [{ stream_id: VIAJE, client_id: CLIENTE }]
})

describe('un workflow_id que no es uuid es «no existe», no un 500 (HALLAZGO CC6 · T7)', () => {
  it('la forma del uuid', () => {
    expect(UUID_DEL_VIAJE.test(VIAJE)).toBe(true)
    expect(UUID_DEL_VIAJE.test(VIAJE.toUpperCase())).toBe(true)
    for (const x of [LECTOR, '', 'tablero', `${VIAJE} `, `${VIAJE}x`, VIAJE.replace(/-/g, '')]) expect(UUID_DEL_VIAJE.test(x)).toBe(false)
  })
  it('🔴 el adaptador real: el id del lector → false SIN preguntar a la sala (antes: 22P02 → lanzaba)', async () => {
    await expect(almacenDeSupabase().journeyExiste(LECTOR, CLIENTE)).resolves.toBe(false)
    expect(deLaSala()).toHaveLength(0)
  })
  it('un uuid sigue preguntando a la sala: el viaje que existe → true; otro uuid → false', async () => {
    await expect(almacenDeSupabase().journeyExiste(VIAJE, CLIENTE)).resolves.toBe(true)
    await expect(almacenDeSupabase().journeyExiste('11111111-2222-4333-8444-555555555555', CLIENTE)).resolves.toBe(false)
    expect(deLaSala()).toHaveLength(2)
    expect(deLaSala()[0].filtros).toEqual([['stream_id', VIAJE], ['client_id', CLIENTE]])
  })
  it('🔴 el camino de T7 entero (autorizarLlamada con el adaptador real): el lector fuera de `flujos` recibe 403 E-WORKFLOW-DESCONOCIDO', async () => {
    const r = await autorizarLlamada(almacenDeSupabase(), { workflow_id: LECTOR, ...ex }, CLIENTE)
    expect(r).toMatchObject({ status: 403, cuerpo: { code: 'E-WORKFLOW-DESCONOCIDO' } })
  })
  it('lo de antes sigue igual: el lector DENTRO de `flujos` pasa; un viaje uuid de la sala pasa', async () => {
    tablas.cadena_config = [{ clave: 'flujos', valor: [...FLUJOS, LECTOR] }]
    await expect(autorizarLlamada(almacenDeSupabase(), { workflow_id: LECTOR, ...ex }, CLIENTE)).resolves.toBeNull()
    await expect(autorizarLlamada(almacenDeSupabase(), { workflow_id: VIAJE, ...ex }, CLIENTE)).resolves.toBeNull()
  })
  it('🔴 `verificarViaje` con un journey_id que no es uuid contesta existe:false (no un 500)', async () => {
    const r = await verificarViaje(almacenDeSupabase(), { client_id: CLIENTE, journey_id: LECTOR, workflow_id: VIAJE, ...ex })
    expect(r).toEqual({ status: 200, cuerpo: { existe: false } })
  })
  it('la base falsa se porta como Postgres: un texto no-uuid en stream_id da 22P02 (control de la prueba)', async () => {
    const r = await consulta('sala_event_log').select('stream_id').eq('stream_id', LECTOR).eq('client_id', CLIENTE).limit(1)
    expect(r.error).toMatchObject({ code: '22P02' })
  })
})
