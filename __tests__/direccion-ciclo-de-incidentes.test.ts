/**
 * El ciclo de vida de los incidentes (01-nov): lo que ya no es un problema se cierra solo, por regla, sin borrar nada. US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { cierreDeAlerta, cierreDeDespacho, cierreDePedido, correrCicloDeIncidentes } from '../src/lib/incidentes/ciclo-de-vida'
import { leerCorridas } from '../src/lib/direccion/corridas'
import { leerRiesgos } from '../src/lib/direccion/riesgos'
import type { Contexto } from '../src/lib/direccion/comun'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const AHORA = new Date('2026-11-01T17:00:00Z')
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ctx = (db: DbFalsa): Contexto => ({ db, ahora: () => AHORA, env: {} })

describe('las reglas', () => {
  it('despacho: antes de 24 h sigue; desde 24 h sin cierre; desde 7 días vencido', () => {
    expect(cierreDeDespacho({ created_at: hace(23.9) }, AHORA)).toBeNull()
    expect(cierreDeDespacho({ created_at: hace(24) }, AHORA)).toContain('sin cierre registrado')
    expect(cierreDeDespacho({ created_at: hace(167) }, AHORA)).toContain('sin cierre registrado')
    expect(cierreDeDespacho({ created_at: hace(168) }, AHORA)).toContain('vencido')
    expect(cierreDeDespacho({ created_at: 'x' }, AHORA)).toBeNull()
  })
  it('alerta: un aviso caduca a las 24 h de su última repetición, no de su apertura', () => {
    const vacio = new Set<string>()
    expect(cierreDeAlerta({ clave: 'aviso-del-dia:x', ultima_en: hace(23), abierto_en: hace(99) }, AHORA, vacio)).toBeNull()
    expect(cierreDeAlerta({ clave: 'aviso-del-dia:x', ultima_en: hace(24), abierto_en: hace(99) }, AHORA, vacio)).toContain('caducó')
    expect(cierreDeAlerta({ clave: 'x', abierto_en: hace(30) }, AHORA, vacio)).toContain('caducó')
  })
  it('alerta de pausa: manda la pausa, no la edad', () => {
    expect(cierreDeAlerta({ clave: `pausa:${C}`, ultima_en: hace(999) }, AHORA, new Set([C]))).toBeNull()
    expect(cierreDeAlerta({ clave: `pausa:${C}`, ultima_en: hace(1) }, AHORA, new Set())).toBe('la pausa ya se levantó')
    expect(cierreDeAlerta({ clave: 'pausa:sin-cliente', ultima_en: hace(999) }, AHORA, new Set())).toBeNull()
  })
  it('pedido de cambios: a las 2 h falla; el que nunca despertó al flujo se puede reintentar y no se toca', () => {
    expect(cierreDePedido({ despertado: true, actualizado_en: hace(1.9) }, AHORA)).toBeNull()
    expect(cierreDePedido({ despertado: true, actualizado_en: hace(2) }, AHORA)).toContain('sin versión nueva')
    expect(cierreDePedido({ despertado: null, actualizado_en: hace(3) }, AHORA)).toContain('sin versión nueva')
    expect(cierreDePedido({ despertado: false, actualizado_en: hace(99) }, AHORA)).toBeNull()
  })
})

describe('la corrida', () => {
  const base = () => new DbFalsa()
    .semilla('agent_dispatches', [
      { id: 'd1', dispatch_key: 'viejo', status: 'running', created_at: hace(30), metadata: { track: 'O' } },
      { id: 'd2', dispatch_key: 'semanas', status: 'accepted', created_at: hace(800), metadata: null },
      { id: 'd3', dispatch_key: 'reciente', status: 'running', created_at: hace(2), metadata: {} },
      { id: 'd4', dispatch_key: 'listo', status: 'completed', created_at: hace(900), metadata: {} },
    ])
    .semilla('cerebro_alertas', [
      { clave: 'aviso-del-dia:a', ultimo_detalle: 'gasto', abierto_en: hace(60), ultima_en: hace(60) },
      { clave: 'aviso-del-dia:b', ultimo_detalle: 'hoy', abierto_en: hace(1), ultima_en: hace(1) },
      { clave: `pausa:${C}`, ultimo_detalle: 'pausado', abierto_en: hace(99), ultima_en: hace(99) },
      { clave: 'cerrada', abierto_en: hace(99), ultima_en: hace(99), cerrado_en: hace(50) },
    ])
    .semilla('cerebro_portero_pausas', [{ id: 'p', client_id: C }])
    .semilla('plan_cambios', [{ id: 'c1', estado: 'en_reescritura', despertado: true, actualizado_en: hace(3) }, { id: 'c2', estado: 'pendiente', despertado: false, actualizado_en: hace(30) }, { id: 'c3', estado: 'aplicado', despertado: true, actualizado_en: hace(30) }])

  it('🔴 sin ejecutar solo informa: no escribe nada', async () => {
    const db = base()
    const antes = JSON.stringify(db.tablas)
    const r = await correrCicloDeIncidentes(ctx(db))
    expect(r.ejecutado).toBe(false)
    expect(r.cierres.map((c) => c.id)).toEqual(['viejo', 'semanas', 'aviso-del-dia:a', 'c1'])
    expect(JSON.stringify(db.tablas)).toBe(antes)
    expect((await correrCicloDeIncidentes(ctx(db), { ejecutar: 'true' as never })).ejecutado).toBe(false)
  })
  it('al ejecutar cierra con motivo, conserva todo y no toca lo demás', async () => {
    const db = base()
    const r = await correrCicloDeIncidentes(ctx(db), { ejecutar: true })
    expect(r.total).toBe(4); expect(r.cierres.every((c) => c.aplicado)).toBe(true)
    const d = db.tablas['agent_dispatches']
    expect(d).toHaveLength(4)
    expect(d[0]).toMatchObject({ status: 'sin_cierre', updated_at: AHORA.toISOString(), metadata: { track: 'O', cierre: { regla: 'ciclo-de-incidentes', estado_anterior: 'running' } } })
    expect(d[1]).toMatchObject({ status: 'sin_cierre', metadata: { cierre: { estado_anterior: 'accepted' } } })
    expect(String((d[1].metadata as { cierre: { motivo: string } }).cierre.motivo)).toContain('vencido')
    expect(d[2].status).toBe('running'); expect(d[3].status).toBe('completed')
    const a = db.tablas['cerebro_alertas']
    expect(a).toHaveLength(4)
    expect(a[0].cerrado_en).toBe(AHORA.toISOString()); expect(String(a[0].ultimo_detalle)).toMatch(/^gasto · cerrada por regla: caducó/)
    expect(a[1].cerrado_en).toBeUndefined(); expect(a[2].cerrado_en).toBeUndefined(); expect(a[3].cerrado_en).toBe(hace(50))
    const p = db.tablas['plan_cambios']
    expect(p[0]).toMatchObject({ estado: 'fallido', actualizado_en: AHORA.toISOString() }); expect(String(p[0].despertar_detalle)).toContain('sin versión nueva')
    expect(p[1].estado).toBe('pendiente'); expect(p[2].estado).toBe('aplicado')
  })
  it('correr dos veces no cierra dos veces', async () => {
    const db = base()
    await correrCicloDeIncidentes(ctx(db), { ejecutar: true })
    expect((await correrCicloDeIncidentes(ctx(db), { ejecutar: true })).total).toBe(0)
  })
  it('🔴 si no se pudo leer las pausas, no cierra ninguna alerta de pausa; las demás siguen', async () => {
    const db = base().semilla('cerebro_portero_pausas', [])
    db.tablas['cerebro_portero_pausas'] = []
    db.fallar['cerebro_portero_pausas'] = 'se cayó'
    const r = await correrCicloDeIncidentes(ctx(db), { ejecutar: true })
    expect(r.completo).toBe(false)
    expect(r.cierres.map((c) => c.id)).toContain('aviso-del-dia:a')
    expect(db.tablas['cerebro_alertas'][2].cerrado_en).toBeUndefined()
    db.fallar = {}
    expect((await correrCicloDeIncidentes(ctx(db), { ejecutar: true })).cierres.map((c) => c.id)).toEqual([`pausa:${C}`])
  })
  it('si una tabla falla al escribir, lo dice y sigue con las demás', async () => {
    const db = base()
    const from = db.from.bind(db)
    db.from = ((t: string) => {
      const q = from(t) as unknown as { update: (p: unknown) => unknown }
      if (t === 'agent_dispatches') q.update = () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: null, error: { message: 'CHECK violado' } }) }) }) })
      return q
    }) as unknown as typeof db.from
    const r = await correrCicloDeIncidentes(ctx(db), { ejecutar: true })
    expect(r.cierres.filter((c) => c.tipo === 'despacho').every((c) => c.aplicado === false && c.detalle === 'CHECK violado')).toBe(true)
    expect(r.cierres.find((c) => c.id === 'c1')?.aplicado).toBe(true)
  })
  it('una vuelta tardía entre la lectura y el cierre no se pisa', async () => {
    const db = base()
    const from = db.from.bind(db)
    let hecho = false
    db.from = ((t: string) => {
      const q = from(t) as unknown as { update: (p: Record<string, unknown>) => unknown }
      if (t === 'agent_dispatches' && !hecho) { const u = q.update.bind(q); q.update = (p) => { hecho = true; db.tablas['agent_dispatches'][0].status = 'completed'; return u(p) } }
      return q
    }) as unknown as typeof db.from
    const r = await correrCicloDeIncidentes(ctx(db), { ejecutar: true })
    expect(db.tablas['agent_dispatches'][0].status).toBe('completed')
    expect(r.cierres[0]).toMatchObject({ id: 'viejo', aplicado: false, detalle: 'cambió mientras tanto: no se tocó' })
  })
})

describe('otra decisión entre la lectura y el cierre', () => {
  const adelantarse = (db: DbFalsa, tabla: string, cambio: Record<string, unknown>) => {
    const from = db.from.bind(db)
    let hecho = false
    db.from = ((t: string) => {
      const q = from(t) as unknown as { update: (p: Record<string, unknown>) => unknown }
      if (t === tabla && !hecho) { const u = q.update.bind(q); q.update = (p) => { hecho = true; Object.assign(db.tablas[tabla][0], cambio); return u(p) } }
      return q
    }) as unknown as typeof db.from
  }
  it('un pedido que acaba de quedar aplicado no pasa a fallido', async () => {
    const db = new DbFalsa().semilla('plan_cambios', [{ id: 'c1', estado: 'en_reescritura', despertado: true, actualizado_en: hace(3) }])
    adelantarse(db, 'plan_cambios', { estado: 'aplicado' })
    const r = await correrCicloDeIncidentes(ctx(db), { ejecutar: true })
    expect(db.tablas['plan_cambios'][0].estado).toBe('aplicado')
    expect(r.cierres[0]).toMatchObject({ aplicado: false, detalle: 'cambió mientras tanto: no se tocó' })
  })
  it('una alerta que otro acaba de cerrar conserva su cierre', async () => {
    const cerradaAntes = hace(0.01)
    const db = new DbFalsa().semilla('cerebro_alertas', [{ clave: 'aviso', ultimo_detalle: 'x', abierto_en: hace(60), ultima_en: hace(60) }])
    adelantarse(db, 'cerebro_alertas', { cerrado_en: cerradaAntes })
    const r = await correrCicloDeIncidentes(ctx(db), { ejecutar: true })
    expect(db.tablas['cerebro_alertas'][0].cerrado_en).toBe(cerradaAntes)
    expect(r.cierres[0]).toMatchObject({ aplicado: false })
  })
})

describe('las pantallas lo reflejan', () => {
  it('riesgos: un despacho sin cierre sale de la lista; y corridas dice «sin_cierre», no «en curso» ni «atascada»', async () => {
    const db = new DbFalsa().semilla('agent_dispatches', [{ id: 'd', dispatch_key: 'k', agent_name: 'a', workflow_execution_id: '77', status: 'sin_cierre', created_at: hace(30) }])
    const r = await leerRiesgos(ctx(db))
    expect(r.riesgos.find((x) => x.id === 'despacho:k')).toBeUndefined()
    const c = await leerCorridas(ctx(db))
    expect(c.corridas[0]).toMatchObject({ workflow_execution_id: '77', estado: 'sin_cierre' })
  })
  it('una corrida con su empleado terminado sigue «completa» aunque su despacho quedó sin cierre', async () => {
    const db = new DbFalsa().semilla('agent_dispatches', [{ id: 'd', dispatch_key: 'k', agent_name: 'a', workflow_execution_id: '77', status: 'sin_cierre', created_at: hace(30) }]).semilla('agent_invocations', [{ id: 'i', agent_name: 'a', workflow_execution_id: '77', status: 'completed', started_at: hace(30) }])
    expect((await leerCorridas(ctx(db))).corridas[0].estado).toBe('completa')
  })
})

describe('la ruta', () => {
  const previo = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int' })
  afterEach(() => { if (previo === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previo })
  const pet = (cuerpo: unknown, llave: string | null = 'k-int') => new Request('https://t.test/x', { method: 'POST', headers: llave ? { 'x-api-key': llave } : {}, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
  it('sin llave 401; sin ejecutar:true (o con JSON malo) solo informa; con él cierra', async () => {
    const { POST } = await import('@/app/api/incidentes/ciclo-de-vida/route')
    const db = new DbFalsa().semilla('agent_dispatches', [{ id: 'd', dispatch_key: 'k', status: 'running', created_at: new Date(Date.now() - 30 * 3_600_000).toISOString() }])
    mocks.db = db
    expect((await POST(pet({ ejecutar: true }, null))).status).toBe(401)
    expect((await (await POST(pet('{'))).json()).ejecutado).toBe(false)
    expect((await (await POST(pet({ ejecutar: 'true' }))).json()).ejecutado).toBe(false)
    expect(db.tablas['agent_dispatches'][0].status).toBe('running')
    expect((await (await POST(pet({ ejecutar: true }))).json()).ejecutado).toBe(true)
    expect(db.tablas['agent_dispatches'][0].status).toBe('sin_cierre')
  })
})

describe('la migración y el reconciliador', () => {
  const RAIZ = join(__dirname, '..')
  const lee = (p: string) => readFileSync(join(RAIZ, p), 'utf8').replace(/\r/g, '')
  it('la migración solo amplía la lista; la reversa la devuelve y se niega con filas sin_cierre', () => {
    const m = lee('supabase/migrations/202611012000_agent_dispatches_estado_sin_cierre.sql')
    const r = lee('supabase/reversas/202611012000_agent_dispatches_estado_sin_cierre_REVERSA.sql')
    expect(m).toContain("CHECK (status IN ('accepted', 'running', 'completed', 'error', 'sin_cierre'))")
    expect(m).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/)
    expect(r).toContain("CHECK (status IN ('accepted', 'running', 'completed', 'error'))")
    expect(r).toMatch(/IF n > 0 THEN RAISE EXCEPTION/)
    expect(r).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/)
  })
  it('el reconciliador da por resuelto un despacho sin_cierre', () => {
    const mod = {} as { exports: Record<string, (...a: unknown[]) => { clasificacion: string; severidad: string }> }
    mod.exports = {}
    new Function('module', lee('scripts/worker-staging/reconciliador/clasificar.js'))(mod)
    const fila = { status: 'sin_cierre', created_at: hace(30), workflow_execution_id: '1', agent_name: 'a' }
    expect(mod.exports.clasificarDespacho(fila, { id: 'i', created_at: hace(29) }, [], AHORA.getTime())).toMatchObject({ clasificacion: 'ok', severidad: 'ok' })
  })
})
