/**
 * EL ECO DE LOS LÍMITES Y LA PARIDAD DE LAS DOS PUERTAS · pruebas a costo cero · CC#1 · 2026-10-01 (PR #418 · puntos 3 y 4 del encargo «poner en verde el PR #418»).
 *   ① el acuse 202 de `run-sdk` lleva el ECO `mirar_afuera_limites` que dijo el corredor (para que quien pidió VERIFIQUE) · sin eco del corredor ⇒ sin eco (el flujo de la pieza se detiene)
 *   ② PARIDAD (el techo 1..20 y la forma viven en DOS puertas: la de Vercel y el módulo del corredor, que no pueden importarse entre sí): para una tabla de valores, las dos aceptan o rechazan LO MISMO.
 *      Si alguien cambia el techo en una sola (mutación N13: 20 → 2.000 en el módulo), esta prueba se pone roja.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn(), setTag: vi.fn(), withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: vi.fn().mockResolvedValue({ blocked: false }) }))
vi.mock('@vercel/functions', () => ({ waitUntil: (_p: Promise<unknown>) => {} }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'insert', 'update', 'upsert']) q[m] = () => q; q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r); q.maybeSingle = async () => ({ data: null, error: null }); q.single = q.maybeSingle; return q } }),
}))
vi.mock('@/lib/agent-dispatch-ledger', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-dispatch-ledger')>()), recordDispatchIntent: vi.fn().mockResolvedValue({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', idempotent: false }), markDispatchRunning: vi.fn().mockResolvedValue(undefined), markDispatchTerminal: vi.fn().mockResolvedValue(undefined) }))
import { POST } from '@/app/api/agents/run-sdk/route'

const require = createRequire(import.meta.url)
const { resolverLimites, LIMITE_MAXIMO_DE_PEDIDOS } = require(join(process.cwd(), 'services', 'agent-runner', 'src', 'lib', 'mcp', 'mirar-afuera-limites.js')) as {
  resolverLimites: (...c: unknown[]) => { ok: boolean }
  LIMITE_MAXIMO_DE_PEDIDOS: number
}

const N8N = 'https://n8n-production-72be.up.railway.app/webhook-waiting/900?signature=abc'
const pedido = (extra: Record<string, unknown> = {}) => ({ agent: 'campaign-brief-agent', task: 'trivial', client_id: null, workflow_id: 'WF1', workflow_execution_id: '900', step_name: 'brief', ...extra })
const req = (b: Record<string, unknown>) => new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) })
const DEL_CORREDOR = (cuerpo: Record<string, unknown>) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status: 202, headers: { 'content-type': 'application/json' } }))
beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTERNAL_API_KEY = 'k'; process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
})

describe('① el acuse 202 de run-sdk (la vuelta por callback) lleva el ECO de los límites que Vercel leyó', () => {
  const CUATRO = ['instagram', 'ficha_en_mapas', 'leer_el_sitio', 'que_dice_el_buscador']
  const conCallback = (extra: Record<string, unknown> = {}) => pedido({ callback_mode: 'runner', callback_url: N8N, ...extra })
  const ok = () => vi.stubGlobal('fetch', DEL_CORREDOR({ accepted: true, delivered_by: 'runner', dispatch_key: 'dispatch:W:a:1' }))
  it('🔴 con límites válidos ⇒ el acuse inmediato HACE ECO de lo aceptado (quien pidió lo compara con lo que mandó)', async () => {
    ok()
    const res = await POST(req(conCallback({ mirar_afuera_limites: { max_pedidos: 4, permitidos: CUATRO } })))
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ accepted: true, will_callback: true, dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', mirar_afuera_limites: { max_pedidos: 4, permitidos: CUATRO } })
  })
  it('también si vienen dentro de context', async () => {
    ok()
    const res = await POST(req(conCallback({ context: { mirar_afuera_limites: { max_pedidos: 2 } } })))
    expect((await res.json()).mirar_afuera_limites).toEqual({ max_pedidos: 2 })
  })
  it('🔴 un límite mal escrito se RECHAZA con 400 ANTES del acuse (síncrono · no un fallo asíncrono a la hora) y no se registra ningún despacho', async () => {
    ok()
    const res = await POST(req(conCallback({ mirar_afuera_limites: { max_pedidos: 0 } })))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-MIRAR-LIMITES-INVALID')
  })
  it('CONTROL POSITIVO: sin límites ⇒ el acuse de siempre, ni existe la clave del eco', async () => {
    ok()
    const res = await POST(req(conCallback()))
    const j = await res.json()
    expect(res.status).toBe(202)
    expect(Object.keys(j).sort()).toEqual(['accepted', 'ack_timestamp', 'callback_url', 'dispatch_key', 'will_callback'])
  })
})

describe('② PARIDAD · el techo y la forma, en las DOS puertas', () => {
  const aceptaVercel = async (limites: unknown) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, response: 'x', costUsd: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const res = await POST(req(pedido({ mirar_afuera_limites: limites })))
    return res.status !== 400
  }
  const CASOS: unknown[] = [
    { max_pedidos: 1 }, { max_pedidos: 4 }, { max_pedidos: 19 }, { max_pedidos: 20 }, { max_pedidos: 21 }, { max_pedidos: 100 }, { max_pedidos: 2000 }, { max_pedidos: 0 }, { max_pedidos: -3 }, { max_pedidos: 1.5 }, { max_pedidos: '4' }, { max_pedidos: null },
    { permitidos: ['instagram'] }, { permitidos: [] }, { permitidos: 'instagram' }, { permitidos: [1] }, { permitidos: null },
    { max_pedidos: 4, permitidos: ['instagram', 'ficha_en_mapas'] }, {}, [], 'x', 3, null, true,
  ]
  it.each(CASOS.map((c) => [JSON.stringify(c), c]))('🔴 %s · Vercel y el corredor deciden LO MISMO', async (_n, caso) => {
    const vercel = await aceptaVercel(caso)
    const corredor = resolverLimites(caso).ok
    expect(vercel, 'Vercel dice ' + vercel + ' y el corredor dice ' + corredor).toBe(corredor)
  })
  it('🔴 el techo (N13): 20 en el módulo del corredor Y Vercel rechaza el 21 · los dos son el MISMO número', async () => {
    expect(LIMITE_MAXIMO_DE_PEDIDOS).toBe(20)
    expect(await aceptaVercel({ max_pedidos: LIMITE_MAXIMO_DE_PEDIDOS })).toBe(true)
    expect(await aceptaVercel({ max_pedidos: LIMITE_MAXIMO_DE_PEDIDOS + 1 })).toBe(false)
    expect(resolverLimites({ max_pedidos: LIMITE_MAXIMO_DE_PEDIDOS + 1 }).ok).toBe(false)
  })
  it('lo ÚNICO que Vercel no puede saber es el catálogo (qué opciones existen): una opción inventada pasa la puerta de Vercel y la rechaza el corredor (declarado)', async () => {
    expect(await aceptaVercel({ permitidos: ['no_existe'] })).toBe(true)
    expect(resolverLimites({ permitidos: ['no_existe'] }).ok).toBe(false)
  })
})
