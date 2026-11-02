/**
 * La lectura agregada de corridas (pedido de CC5 · 02-nov). Base falsa. US$ 0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { leerCorridas } from '../src/lib/direccion/corridas'
import { leerResumenDeCorridas, MAX_DIAS_DEL_RESUMEN } from '../src/lib/direccion/corridas-resumen'
import type { Contexto } from '../src/lib/direccion/comun'

const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn(() => { throw new Error('no debía tocar la base') }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }))
import { GET } from '../src/app/api/direccion/corridas/resumen/route'

const AHORA = new Date('2026-11-03T17:00:00Z')
const ctx = (db: DbFalsa): Contexto => ({ db, ahora: () => AHORA, env: {} })
let n = 0
const inv = (o: Record<string, unknown>) => ({ id: `i${++n}`, workflow_id: 'flujo-a', workflow_execution_id: `e${n}`, client_id: 'c1', agent_name: 'x', started_at: '2026-11-02T12:00:00Z', ended_at: '2026-11-02T12:10:00Z', cost_usd: 1, status: 'completed', ...o })
const leer = (db: DbFalsa, o: Record<string, unknown> = {}) => leerResumenDeCorridas(ctx(db), { desde: '2026-11-02', hasta: '2026-11-02', ...o })
const grupos = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo.grupos as Array<Record<string, unknown>>

describe('las cifras', () => {
  it('🔴 un renglón por flujo y cliente, con ejecuciones, errores, mediana, máximo y costo', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [
      inv({ ended_at: '2026-11-02T12:10:00Z' }),
      inv({ ended_at: '2026-11-02T12:20:00Z' }),
      inv({ ended_at: '2026-11-02T13:00:00Z', status: 'error', cost_usd: 2 }),
      inv({ client_id: 'c2' }),
      inv({ workflow_id: 'flujo-b' }),
    ])
    const r = await leer(db)
    expect(grupos(r)).toHaveLength(3)
    expect(grupos(r)[0]).toMatchObject({ workflow_id: 'flujo-a', client_id: 'c1', ejecuciones: 3, con_error: 1, en_curso: 0, mediana_ms: 1_200_000, max_ms: 3_600_000, costo_usd: 4 })
  })

  it('🔴 mediana con cantidad par: el promedio de las dos del medio', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ ended_at: '2026-11-02T12:10:00Z' }), inv({ ended_at: '2026-11-02T12:20:00Z' })])
    expect(grupos(await leer(db))[0]).toMatchObject({ mediana_ms: 900_000, max_ms: 1_200_000 })
  })

  it('🔴 lo que sigue en curso no cuenta para la duración, y se separa de lo atascado', async () => {
    const db = new DbFalsa().semilla('agent_dispatches', [
      { dispatch_key: 'd1', workflow_id: 'flujo-a', workflow_execution_id: 'v1', agent_name: 'x', client_id: 'c1', status: 'running', created_at: '2026-11-02T12:00:00Z' },
      { dispatch_key: 'd2', workflow_id: 'flujo-a', workflow_execution_id: 'v2', agent_name: 'x', client_id: 'c1', status: 'running', created_at: '2026-11-03T16:50:00Z' },
    ])
    const r = await leerResumenDeCorridas(ctx(db), { desde: '2026-11-02', hasta: '2026-11-03' })
    expect(grupos(r)[0]).toMatchObject({ ejecuciones: 2, con_error: 0, en_curso: 1, atascadas: 1, mediana_ms: null, max_ms: null })
  })

  it('🔴 una ejecución con ramas es UNA corrida, como en la lista', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ workflow_execution_id: '209744' }), inv({ workflow_execution_id: '209744:analisis-voz' })])
    expect(grupos(await leer(db))[0]).toMatchObject({ ejecuciones: 1, costo_usd: 2 })
  })

  it('🔴 da lo mismo que la lista, corrida por corrida', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({}), inv({ status: 'error', ended_at: '2026-11-02T13:00:00Z' }), inv({ error_message: 'x' })])
    const l = await leerCorridas(ctx(db), { dias: 7 })
    const g = grupos(await leer(db))[0]
    expect(g.ejecuciones).toBe(l.total)
    expect(g.con_error).toBe(l.corridas.filter((c) => c.estado === 'fallida').length)
  })

  it('🔴 sin dato no es cero: sin duración, mediana y máximo son nulos', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ ended_at: null })])
    expect(grupos(await leer(db))[0]).toMatchObject({ mediana_ms: null, max_ms: null })
  })
})

describe('los días son de Ecuador', () => {
  it('🔴 las 02:00 UTC del 3 todavía son el 2 en Ecuador', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ started_at: '2026-11-03T02:00:00Z', ended_at: '2026-11-03T02:10:00Z' })])
    expect(grupos(await leer(db))[0].por_dia).toEqual([{ d: '2026-11-02', ejecuciones: 1, con_error: 0 }])
  })

  it('🔴 los bordes: 04:59 UTC del 2 es el día anterior, 05:00 ya es el 2, y 05:00 del 3 ya no', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [
      inv({ started_at: '2026-11-02T04:59:00Z', ended_at: null }),
      inv({ started_at: '2026-11-02T05:00:00Z', ended_at: null }),
      inv({ started_at: '2026-11-03T04:59:00Z', ended_at: null }),
      inv({ started_at: '2026-11-03T05:00:00Z', ended_at: null }),
    ])
    expect(grupos(await leer(db))[0]).toMatchObject({ ejecuciones: 2 })
  })

  it('🔴 por día, ordenado, con sus errores', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ started_at: '2026-11-03T12:00:00Z', status: 'error' }), inv({ started_at: '2026-11-02T12:00:00Z' }), inv({ started_at: '2026-11-03T13:00:00Z' })])
    const r = await leerResumenDeCorridas(ctx(db), { desde: '2026-11-02', hasta: '2026-11-03' })
    expect(grupos(r)[0].por_dia).toEqual([{ d: '2026-11-02', ejecuciones: 1, con_error: 0 }, { d: '2026-11-03', ejecuciones: 2, con_error: 1 }])
  })

  it('🔴 una corrida que empezó dentro cuenta entera, aunque termine fuera; una que empezó fuera, no', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [
      inv({ workflow_execution_id: 'dentro', started_at: '2026-11-03T04:50:00Z', cost_usd: 1 }),
      inv({ workflow_execution_id: 'dentro', started_at: '2026-11-03T05:10:00Z', cost_usd: 1 }),
      inv({ workflow_execution_id: 'fuera', started_at: '2026-11-01T23:00:00Z', cost_usd: 5 }),
      inv({ workflow_execution_id: 'fuera', started_at: '2026-11-02T12:00:00Z', cost_usd: 5 }),
    ])
    expect(grupos(await leer(db))[0]).toMatchObject({ ejecuciones: 1, costo_usd: 2 })
  })
})

describe('sin tope', () => {
  it('🔴 más de 1000 filas se leen enteras, y queda completo', async () => {
    const filas = Array.from({ length: 2500 }, (_, i) => inv({ id: `p${String(i).padStart(5, '0')}`, workflow_execution_id: `m${i}` }))
    const r = await leer(new DbFalsa().semilla('agent_invocations', filas))
    expect(grupos(r)[0]).toMatchObject({ ejecuciones: 2500 })
    expect(r.cuerpo.completo).toBe(true)
  })

  it('🔴 exactamente 1000 filas no se confunden con un corte', async () => {
    const filas = Array.from({ length: 1000 }, (_, i) => inv({ id: `q${String(i).padStart(5, '0')}`, workflow_execution_id: `k${i}` }))
    const r = await leer(new DbFalsa().semilla('agent_invocations', filas))
    expect(grupos(r)[0]).toMatchObject({ ejecuciones: 1000 })
    expect(r.cuerpo.completo).toBe(true)
  })

  it('🔴 si una fuente falla, queda declarado: completo es falso', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({})])
    db.fallar['agent_dispatches'] = 'caída'
    const r = await leer(db)
    expect(r.status).toBe(200)
    expect(r.cuerpo.completo).toBe(false)
  })
})

describe('el tope de páginas', () => {
  it('🔴 una fuente que nunca termina se declara: completo es falso', async () => {
    const filas = Array.from({ length: 1000 }, (_, i) => inv({ id: `t${i}` }))
    let pag = 0
    const consulta = (datos: unknown[]) => { const q = { select: () => q, gte: () => q, lt: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, limit: () => q, maybeSingle: () => q, single: () => q, range: () => { pag++; return Promise.resolve({ data: datos.map((f, i) => ({ ...(f as object), id: `p${pag}-${i}`, dispatch_key: `p${pag}-${i}` })), error: null }) } }; return q }
    const db = { from: (t: string) => consulta(t === 'agent_invocations' ? filas : []) }
    const r = await leerResumenDeCorridas({ db, ahora: () => AHORA, env: {} } as never, { desde: '2026-11-02', hasta: '2026-11-02' })
    expect(r.cuerpo.completo).toBe(false)
    expect((r.cuerpo.fuentes as Array<Record<string, unknown>>).find((f) => f.fuente === 'agent_invocations')).toMatchObject({ truncado: true })
  })
})

describe('el cliente y la entrada', () => {
  it('🔴 con client_id solo ese', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ client_id: 'c1' }), inv({ client_id: 'c2' })])
    const g = grupos(await leer(db, { client_id: 'c2' }))
    expect(g).toHaveLength(1)
    expect(g[0].client_id).toBe('c2')
  })

  it('🔴 una corrida de varios clientes va al mismo renglón que en la lista', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [
      inv({ id: 'a', workflow_execution_id: 'varios', client_id: 'c1', started_at: '2026-11-02T12:00:00Z' }),
      inv({ id: 'b', workflow_execution_id: 'varios', client_id: 'c2', started_at: '2026-11-02T13:00:00Z' }),
    ])
    const lista = await leerCorridas(ctx(db), { dias: 7 })
    expect(lista.corridas[0].client_id).toBe('c2')
    expect(grupos(await leer(db))[0]).toMatchObject({ client_id: 'c2', ejecuciones: 1 })
  })

  it('🔴 también si la corrida de varios clientes solo tiene despachos', async () => {
    const d = (dispatch_key: string, client_id: string, created_at: string) => ({ dispatch_key, workflow_id: 'flujo-a', workflow_execution_id: 'solo-despachos', agent_name: dispatch_key, client_id, status: 'completed', created_at, completed_at: created_at })
    const db = new DbFalsa().semilla('agent_dispatches', [d('a', 'c1', '2026-11-02T12:00:00Z'), d('b', 'c2', '2026-11-02T13:00:00Z')])
    const lista = await leerCorridas(ctx(db), { dias: 7 })
    expect(lista.corridas[0].client_id).toBe('c2')
    expect(grupos(await leer(db))[0]).toMatchObject({ client_id: 'c2' })
  })

  it('una corrida sin cliente va en su propio renglón', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ client_id: null })])
    expect(grupos(await leer(db))[0].client_id).toBeNull()
  })

  it('una fila sin ejecución no se pierde en silencio', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ workflow_execution_id: null })])
    expect((await leer(db)).cuerpo.filas_sin_ejecucion).toBe(1)
  })

  it.each([
    [{ desde: 'ayer' }], [{ hasta: '2026-13-40' }], [{ desde: '2026-02-30' }], [{ desde: '2026-11-03', hasta: '2026-11-02' }], [{ desde: undefined }], [{ client_id: 'a b' }], [{ client_id: "x'; drop" }],
  ])('rechaza %j', async (o) => {
    expect((await leer(new DbFalsa(), o)).status).toBe(400)
  })

  it('🔴 el período tiene un máximo, y el máximo pasa', async () => {
    const d = (x: number) => new Date(Date.parse('2026-01-01T00:00:00Z') + x * 86_400_000).toISOString().slice(0, 10)
    expect((await leerResumenDeCorridas(ctx(new DbFalsa()), { desde: d(0), hasta: d(MAX_DIAS_DEL_RESUMEN - 1) })).status).toBe(200)
    expect((await leerResumenDeCorridas(ctx(new DbFalsa()), { desde: d(0), hasta: d(MAX_DIAS_DEL_RESUMEN) })).status).toBe(400)
  })

  it('🔴 no devuelve prompts, entradas ni salidas', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ system_prompt: 'SECRETO', input_summary: 'SECRETO', output_summary: 'SECRETO' })])
    expect(JSON.stringify((await leer(db)).cuerpo)).not.toContain('SECRETO')
  })
})

describe('la ruta', () => {
  const previa = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba'; mocks.getSupabaseAdmin.mockClear() })
  afterEach(() => { if (previa === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previa })

  it('🔴 sin llave responde 401 y no toca la base', async () => {
    const r = await GET(new Request('https://x.test/api/direccion/corridas/resumen?desde=2026-11-02&hasta=2026-11-02'))
    expect(r.status).toBe(401)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })
})
