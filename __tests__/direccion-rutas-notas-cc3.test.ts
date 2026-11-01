/**
 * Lo que CC3 pidió fijar al certificar las rutas de dirección (mutantes D08, R12, R08, C05, C11 vivos + sus tres observaciones). US$ 0, sin red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { leerCorrida, leerCorridas } from '../src/lib/direccion/corridas'
import type { Contexto } from '../src/lib/direccion/comun'
import { leerDecisiones } from '../src/lib/direccion/decisiones'
import { leerRiesgos } from '../src/lib/direccion/riesgos'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const AHORA = new Date('2026-11-01T15:00:00Z')
const SECRETO = 'sk-ant-api03-ABCDEFGHIJKLMN'
const ctx = (db: DbFalsa): Contexto => ({ db, ahora: () => AHORA, env: {} })

describe('los textos libres salen limpios', () => {
  it('D08 · el título de la bandeja', async () => {
    const r = await leerDecisiones(ctx(new DbFalsa().semilla('hitl_queue', [{ id: 'h', status: 'pending', type: 'x', title: `Falló con ${SECRETO}` }])))
    expect(r.decisiones[0].titulo).toContain('[oculto]')
    expect(JSON.stringify(r)).not.toContain('ABCDEFGHIJKLMN')
  })
  it('R12 · el detalle de una alerta abierta', async () => {
    const r = await leerRiesgos(ctx(new DbFalsa().semilla('cerebro_alertas', [{ clave: 'a', titulo: 'Alerta', ultimo_detalle: `llave ${SECRETO}`, abierto_en: '2026-10-31T00:00:00Z' }])))
    const alerta = r.riesgos.find((x) => x.categoria === 'incidente')
    expect(alerta?.detalle).toContain('[oculto]')
    expect(JSON.stringify(r)).not.toContain('ABCDEFGHIJKLMN')
  })
  it('el título de una caída: un monitor sin nombre con una dirección con clave no la deja salir', async () => {
    const r = await leerRiesgos(ctx(new DbFalsa().semilla('uptime_incidents', [{ id: 'u', monitor_url: 'https://x.test/salud?token=valor-secreto-9', created_at: '2026-10-31T00:00:00Z' }, { id: 'v', created_at: '2026-10-31T00:00:00Z' }])))
    const t = r.riesgos.filter((x) => x.categoria === 'servicio').map((x) => x.titulo)
    expect(JSON.stringify(t)).not.toContain('valor-secreto-9')
    expect(t).toContain('Caída registrada: servicio')
  })
})

describe('umbrales', () => {
  it('R08 · un despacho en curso es «atascado» desde 1 h, ni antes ni después', async () => {
    const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString()
    const db = new DbFalsa().semilla('agent_dispatches', [{ dispatch_key: 'a59', agent_name: 'a', status: 'running', created_at: hace(59) }, { dispatch_key: 'a61', agent_name: 'a', status: 'running', created_at: hace(61) }])
    const ids = (await leerRiesgos(ctx(db))).riesgos.map((x) => x.id)
    expect(ids).toContain('despacho:a61'); expect(ids).not.toContain('despacho:a59')
  })
  it('C05 · el parámetro limite no pasa de 200', async () => {
    expect((await leerCorridas(ctx(new DbFalsa()), { limite: 5000 })).limite).toBe(200)
  })
})

describe('el árbol', () => {
  const inv = (x: Record<string, unknown>) => ({ id: 'i', agent_name: 'a', workflow_execution_id: '100', started_at: '2026-11-01T10:00:00Z', cost_usd: 1, status: 'completed', ...x })
  it('C11 · la rama principal va primero aunque sus filas lleguen después', async () => {
    const db = new DbFalsa().semilla('agent_invocations', [inv({ id: 'r', workflow_execution_id: '100:zeta' }), inv({ id: 'b', workflow_execution_id: '100:alfa' }), inv({ id: 'p' })])
    const r = await leerCorrida(ctx(db), '100')
    expect((r.cuerpo.arbol as { rama: string | null }[]).map((a) => a.rama)).toEqual([null, 'alfa', 'zeta'])
  })
  it('el «_» del identificador no trae ramas de otra ejecución parecida (en LIKE es comodín)', async () => {
    const parecida = inv({ id: 'otra', workflow_execution_id: 'axb:rama' })
    const consulta = new DbFalsa().semilla('agent_invocations', [inv({ id: 'mia', workflow_execution_id: 'a_b' }), parecida])
    const from = consulta.from.bind(consulta)
    // la base real sí aplica el comodín: se simula devolviendo también la fila parecida en la consulta de ramas
    consulta.from = ((t: string) => {
      const q = from(t) as unknown as { like: (c: string, p: string) => unknown; then: unknown }
      const like = q.like.bind(q)
      q.like = (c, p) => { if (t === 'agent_invocations') return { limit: async () => ({ data: [parecida], error: null }) }; return like(c, p) }
      return q
    }) as unknown as typeof consulta.from
    const r = await leerCorrida(ctx(consulta), 'a_b')
    expect(r.status).toBe(200)
    const pasos = (r.cuerpo.arbol as { pasos: { id: string }[] }[]).flatMap((a) => a.pasos.map((p) => p.id))
    expect(pasos).toEqual(['mia'])
  })
})

describe('la ruta del árbol', () => {
  const previo = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int' })
  afterEach(() => { if (previo === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previo })
  it('un % mal formado es entrada inválida (400), no un error del sistema (500)', async () => {
    mocks.db = new DbFalsa()
    const { GET } = await import('@/app/api/direccion/corridas/[id]/route')
    const r = await GET(new Request('https://t.test/x', { headers: { 'x-api-key': 'k-int' } }), { params: { id: '%E0%A4%A' } })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('entrada_invalida')
  })
})
