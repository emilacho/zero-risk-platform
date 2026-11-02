/** Observabilidad debe ver las fallas del flujo aunque todos los empleados hayan terminado bien. Los dos casos reales del 02-nov son los que fijan esta prueba. */
import { describe, expect, it } from 'vitest'
import { leerFallasDelFlujo, motivoEnPalabras } from '../src/lib/direccion/fallas'
import type { Db, Fila } from '../src/lib/direccion/comun'

const NAUFRAGO = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const PEDIDO_NAUFRAGO: Fila = { id: 'p1', client_id: NAUFRAGO, documento: 'manual', estado: 'fallido', despertar_detalle: 'el flujo terminó sin dejar una versión nueva del manual · The connection to the server was closed unexpectedly', creado_en: '2026-11-02T19:15:40.751+00:00', actualizado_en: '2026-11-02T19:21:22.234+00:00' }
const EJEC_NAUFRAGO: Fila = { id: '212902', workflowId: 'ssLtwYPt7zxuvnM2', startedAt: '2026-11-02T19:15:41.839Z', stoppedAt: '2026-11-02T19:21:22.041Z' }
const SUELTA: Fila = { id: '300', workflowId: 'otro', startedAt: '2026-11-02T20:00:00.000Z', stoppedAt: '2026-11-02T20:00:05.000Z' }

const llamadas: Array<[string, unknown[]]> = []
function dbCon(filas: Fila[], error: { message: string } | null = null): Db {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'lt', 'order']) q[m] = (...a: unknown[]) => { llamadas.push([m, a]); return q }
  q.limit = async () => ({ data: error ? null : filas, error })
  return { from: () => q }
}
const n8n = (filas: Fila[], status = 200) => (async () => new Response(JSON.stringify({ data: filas }), { status })) as unknown as typeof fetch
const ctx = (db: Db, fetchImpl: typeof fetch = n8n([]), env: Record<string, string> = { N8N_BASE_URL: 'https://n8n.test', N8N_API_KEY: 'x' }) => ({ db, ahora: () => new Date('2026-11-02T21:00:00Z'), fetchImpl, env }) as never
const HOY = { desde: '2026-11-02', hasta: '2026-11-02' }
type Cuerpo = { fallas: Array<Record<string, unknown>>; completo: boolean; fuentes: Array<Record<string, unknown>>; total: number; error?: string }
const leer = async (c: unknown, o: Record<string, unknown> = HOY): Promise<Cuerpo> => (await leerFallasDelFlujo(c as never, o)).cuerpo as unknown as Cuerpo

describe('las fallas del flujo se ven', () => {
  it('🔴 un pedido fallido aparece con cliente, duración y motivo en palabras', async () => {
    const { fallas } = await leer(ctx(dbCon([PEDIDO_NAUFRAGO])))
    expect(fallas).toHaveLength(1)
    expect(fallas[0]).toMatchObject({ origen: 'pedido', client_id: NAUFRAGO, documento: 'manual', motivo: 'Se cortó la conexión con el empleado', duracion_ms: 341483 })
  })
  it('🔴 la ejecución que cayó justo antes de cerrarse el pedido es la misma falla: un renglón, con su número', async () => {
    const { fallas, total } = await leer(ctx(dbCon([PEDIDO_NAUFRAGO]), n8n([EJEC_NAUFRAGO])))
    expect(total).toBe(1)
    expect(fallas[0]).toMatchObject({ ejecucion_id: '212902', workflow_id: 'ssLtwYPt7zxuvnM2' })
  })
  it('🔴 una ejecución en error sin pedido también se ve, y no inventa motivo', async () => {
    const { fallas } = await leer(ctx(dbCon([]), n8n([SUELTA])))
    expect(fallas[0]).toMatchObject({ origen: 'ejecucion', id: '300', motivo: 'El proceso falló sin dar un motivo legible', duracion_ms: 5000, client_id: null })
  })
  it('🔴 una ejecución lejana al cierre del pedido NO se junta con él', async () => {
    const { total } = await leer(ctx(dbCon([PEDIDO_NAUFRAGO]), n8n([{ ...EJEC_NAUFRAGO, stoppedAt: '2026-11-02T19:20:00.000Z' }])))
    expect(total).toBe(2)
  })
  it('🔴 una ejecución posterior al cierre no es la causa', async () => {
    const { total } = await leer(ctx(dbCon([PEDIDO_NAUFRAGO]), n8n([{ ...EJEC_NAUFRAGO, stoppedAt: '2026-11-02T19:21:25.000Z' }])))
    expect(total).toBe(2)
  })
  it('🔴 una ejecución fuera del período no entra', async () => {
    const { total } = await leer(ctx(dbCon([]), n8n([{ ...SUELTA, stoppedAt: '2026-10-20T20:00:05.000Z' }])))
    expect(total).toBe(0)
  })
  it('🔴 van de la más nueva a la más vieja', async () => {
    const { fallas } = await leer(ctx(dbCon([PEDIDO_NAUFRAGO]), n8n([SUELTA])))
    expect(fallas.map((f) => f.id)).toEqual(['300', 'p1'])
  })
})

describe('solo pide lo fallido del período', () => {
  it('🔴 filtra por estado y por días de Ecuador', async () => {
    llamadas.length = 0
    await leer(ctx(dbCon([])))
    expect(llamadas).toContainEqual(['eq', ['estado', 'fallido']])
    expect(llamadas).toContainEqual(['gte', ['actualizado_en', '2026-11-02T05:00:00.000Z']])
    expect(llamadas).toContainEqual(['lt', ['actualizado_en', '2026-11-03T05:00:00.000Z']])
  })
  it('🔴 con cliente: filtra los pedidos y no le atribuye ejecuciones sueltas', async () => {
    llamadas.length = 0
    const { fallas } = await leer(ctx(dbCon([PEDIDO_NAUFRAGO]), n8n([SUELTA])), { ...HOY, client_id: NAUFRAGO })
    expect(llamadas).toContainEqual(['eq', ['client_id', NAUFRAGO]])
    expect(fallas.map((f) => f.id)).toEqual(['p1'])
  })
})

describe('lo que no se pudo leer se declara', () => {
  it('🔴 si la base falla, no dice «sin fallas» como cierto', async () => {
    const r = await leer(ctx(dbCon([], { message: 'caída' })))
    expect(r.completo).toBe(false)
    expect(r.fuentes[0]).toMatchObject({ fuente: 'plan_cambios', estado: 'error' })
  })
  it('🔴 si n8n falla, los pedidos igual salen y queda incompleto', async () => {
    const r = await leer(ctx(dbCon([PEDIDO_NAUFRAGO]), n8n([], 500)))
    expect(r.total).toBe(1)
    expect(r.completo).toBe(false)
  })
  it('🔴 sin llave de n8n lo dice', async () => {
    const r = await leer(ctx(dbCon([]), n8n([]), {}))
    expect(r.fuentes.find((f) => f.fuente === 'n8n')).toMatchObject({ estado: 'sin_credencial' })
  })
  it('🔴 avisa que n8n recuerda pocos días', async () => {
    const r = await leer(ctx(dbCon([])))
    expect(String(r.fuentes.find((f) => f.fuente === 'n8n')!.detalle)).toContain('pocos días')
  })
})

describe('lo que se corta se declara', () => {
  it('🔴 a n8n solo le pide las ejecuciones en error', async () => {
    const urls: string[] = []
    const f = (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify({ data: [] })) }) as unknown as typeof fetch
    await leer(ctx(dbCon([]), f))
    expect(urls[0]).toContain('status=error')
  })
  it('🔴 con la página de n8n llena queda incompleto: las más viejas pudieron quedar fuera', async () => {
    const r = await leer(ctx(dbCon([]), n8n(Array.from({ length: 100 }, (_, i) => ({ ...SUELTA, id: String(i) })))))
    expect(r.completo).toBe(false)
    expect(r.fuentes.find((f) => f.fuente === 'n8n')).toMatchObject({ truncado: true })
  })
  it('🔴 con 99 ejecuciones no se declara corte', async () => {
    const r = await leer(ctx(dbCon([]), n8n(Array.from({ length: 99 }, (_, i) => ({ ...SUELTA, id: String(i) })))))
    expect(r.completo).toBe(true)
  })
  it('🔴 con 500 pedidos queda incompleto y pide ese tope', async () => {
    let tope = 0
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lt', 'order']) q[m] = () => q
    q.limit = async (n: number) => { tope = n; return { data: Array.from({ length: 500 }, (_, i) => ({ ...PEDIDO_NAUFRAGO, id: String(i) })), error: null } }
    const r = await leer(ctx({ from: () => q }))
    expect(tope).toBe(500)
    expect(r.completo).toBe(false)
    expect(r.fuentes.find((f) => f.fuente === 'plan_cambios')).toMatchObject({ truncado: true })
  })
  it('🔴 con 499 pedidos no se declara corte', async () => {
    const r = await leer(ctx(dbCon(Array.from({ length: 499 }, (_, i) => ({ ...PEDIDO_NAUFRAGO, id: String(i) })))))
    expect(r.completo).toBe(true)
  })
  it('🔴 el detalle del pedido sale sin secretos', async () => {
    const LLAVE = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'
    const { fallas } = await leer(ctx(dbCon([{ ...PEDIDO_NAUFRAGO, despertar_detalle: `falló con la llave ${LLAVE}` }])))
    expect(String(fallas[0].detalle)).not.toContain(LLAVE)
  })
})

describe('la entrada se valida', () => {
  it.each([[{ desde: 'x', hasta: '2026-11-02' }], [{ desde: '2026-11-03', hasta: '2026-11-02' }], [{ desde: '2026-01-01', hasta: '2026-11-02' }], [{ ...HOY, client_id: "a'; drop" }], [{ desde: '2026-02-31', hasta: '2026-03-01' }]])('🔴 rechaza %j', async (o) => {
    expect((await leerFallasDelFlujo(ctx(dbCon([])), o)).status).toBe(400)
  })
})

describe('el motivo va en palabras', () => {
  it('🔴 los dos casos reales de hoy', () => {
    expect(motivoEnPalabras('The connection to the server was closed unexpectedly, perhaps it is offline')).toBe('Se cortó la conexión con el empleado')
    expect(motivoEnPalabras('Task execution timed out after 120 seconds')).toBe('Un paso pasó del límite de 2 min')
  })
  it('🔴 el motivo de Zero Risk SI gana al genérico de «sin versión»', () => {
    expect(motivoEnPalabras('el flujo terminó sin dejar una versión nueva del manual · Task execution timed out after 120 seconds')).toBe('Un paso pasó del límite de 2 min')
  })
  it('🔴 sin motivo reconocible no muestra texto técnico', () => {
    expect(motivoEnPalabras('TypeError: x is not a function')).toBe('El proceso falló sin dar un motivo legible')
    expect(motivoEnPalabras(null)).toBe('El proceso falló sin dar un motivo legible')
  })
})
