/**
 * LÍMITES DE «MIRAR AFUERA» · la puerta de Vercel · pruebas a costo cero · CC#1 · 2026-10-01 (encargo Lenovo · punto 3).
 * ① un pedido con límites válidos los REENVÍA al corredor (que los hace cumplir) · ② un límite mal escrito se RECHAZA con 400 ANTES de gastar · ③ sin límites el cuerpo al corredor es el de siempre (opt-in puro).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn(), setTag: vi.fn(), withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: vi.fn().mockResolvedValue({ blocked: false }) }))
vi.mock('@vercel/functions', () => ({ waitUntil: (_p: Promise<unknown>) => {} }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'insert', 'update', 'upsert']) q[m] = () => q; q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r); q.maybeSingle = async () => ({ data: null, error: null }); q.single = q.maybeSingle; return q } }),
}))
import { POST } from '@/app/api/agents/run-sdk/route'

const pedido = (extra: Record<string, unknown> = {}) => ({ agent: 'campaign-brief-agent', task: 'trivial', client_id: null, workflow_id: 'WF1', workflow_execution_id: '900', step_name: 'brief', ...extra })
const req = (b: Record<string, unknown>) => new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) })
let alCorredor: Array<Record<string, unknown>> = []
beforeEach(() => {
  vi.clearAllMocks(); alCorredor = []
  process.env.INTERNAL_API_KEY = 'k'; process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { alCorredor.push(JSON.parse(init.body)); return new Response(JSON.stringify({ success: true, response: 'x', costUsd: 0.1 }), { status: 200, headers: { 'content-type': 'application/json' } }) }))
})

describe('① límites válidos: se reenvían al corredor tal cual', () => {
  it('🔴 arriba o dentro de context · max_pedidos y/o permitidos', async () => {
    const l = { max_pedidos: 4, permitidos: ['instagram', 'ficha_en_mapas', 'leer_el_sitio', 'que_dice_el_buscador'] }
    expect((await POST(req(pedido({ mirar_afuera_limites: l })))).status).toBe(200)
    expect(alCorredor[0].mirar_afuera_limites).toEqual(l)
    alCorredor = []
    await POST(req(pedido({ context: { mirar_afuera_limites: { max_pedidos: 2 } } })))
    expect(alCorredor[0].mirar_afuera_limites).toEqual({ max_pedidos: 2 })
    alCorredor = []
    await POST(req(pedido({ mirar_afuera_limites: { permitidos: ['instagram'] } })))
    expect(alCorredor[0].mirar_afuera_limites).toEqual({ permitidos: ['instagram'] })
  })
})

describe('② límites mal escritos: 400 ANTES de gastar (nada llega al corredor)', () => {
  it.each([
    [{ max_pedidos: 0 }], [{ max_pedidos: -1 }], [{ max_pedidos: 21 }], [{ max_pedidos: 1.5 }], [{ max_pedidos: '4' }], [{ max_pedidos: null }],
    [{ permitidos: [] }], [{ permitidos: 'instagram' }], [{ permitidos: [1] }], [{ permitidos: null }],
    [{}], [{ max_pedidos: 4, otra_cosa: true }], [[]], ['x'], [3], [null], [true],
  ])('🔴 %j ⇒ 400 E-MIRAR-LIMITES-INVALID', async (malo) => {
    const res = await POST(req(pedido({ mirar_afuera_limites: malo })))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-MIRAR-LIMITES-INVALID')
    expect(alCorredor).toHaveLength(0)
  })
})

describe('③ sin límites: el cuerpo al corredor es el de siempre (opt-in puro)', () => {
  it('ni la clave existe', async () => {
    await POST(req(pedido()))
    expect(Object.prototype.hasOwnProperty.call(alCorredor[0], 'mirar_afuera_limites')).toBe(false)
  })
})
