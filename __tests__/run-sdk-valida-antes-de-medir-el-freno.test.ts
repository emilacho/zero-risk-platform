/**
 * VALIDAR PRIMERO · MEDIR DESPUÉS · CC#1 · 2026-09-30 · GO de Emilio · costo cero.
 * El 30-sep una sonda con un valor inválido colgó la función 482 s y disparó la falsa alarma «sin techo medido» de las 14:02: la puerta medía el freno de gasto (consulta a la base)
 * ANTES de validar el pedido. Ahora un pedido mal escrito se rechaza al instante y NO toca el freno.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'


vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn(), setTag: vi.fn(), withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))
const medirFreno = vi.fn()
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: (...a: unknown[]) => medirFreno(...a) }))
const promesas: Promise<unknown>[] = []
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { promesas.push(p) } }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'insert', 'update', 'upsert']) q[m] = () => q; q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r); q.maybeSingle = async () => ({ data: null, error: null }); q.single = q.maybeSingle; return q } }),
}))
const registrar = vi.fn().mockResolvedValue({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', idempotent: false })
vi.mock('@/lib/agent-dispatch-ledger', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-dispatch-ledger')>()), recordDispatchIntent: (...a: unknown[]) => registrar(...a), markDispatchRunning: vi.fn().mockResolvedValue(undefined), markDispatchTerminal: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/agent-async-callback', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-async-callback')>()), dispatchAsyncCallback: vi.fn().mockResolvedValue({ ok: true, status: 'ok', status_code: 200, duration_ms: 1, attempts: 1 }) }))
import { POST } from '@/app/api/agents/run-sdk/route'


const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const pedido = (extra: Record<string, unknown> = {}) => ({ agent: 'campaign-brief-agent', task: 'trivial', client_id: CID, workflow_id: 'WF1', workflow_execution_id: '900', step_name: 'brief', dry_run: true, ...extra })
const req = (b: Record<string, unknown>) => new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) })
let alCorredor: Array<Record<string, unknown>> = []
beforeEach(() => {
  vi.clearAllMocks(); alCorredor = []; promesas.length = 0
  process.env.INTERNAL_API_KEY = 'k'; process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
  registrar.mockResolvedValue({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', idempotent: false })
  medirFreno.mockResolvedValue({ blocked: false })
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { alCorredor.push(JSON.parse(init.body)); return new Response(JSON.stringify({ success: true, response: 'x', costUsd: 0.1 }), { status: 200, headers: { 'content-type': 'application/json' } }) }))
})

describe('🔴 un pedido inválido se rechaza ANTES de medir el freno', () => {
  it.each([
    ['max_budget_usd', { max_budget_usd: 0 }, 'max_budget_usd_invalid'],
    ['max_budget_usd nulo', { max_budget_usd: null }, 'max_budget_usd_invalid'],
    ['thinking_mode', { thinking_mode: 'invalido' }, 'thinking_mode_invalid'],
    ['thinking_mode en context', { context: { thinking_mode: 'high' } }, 'thinking_mode_invalid'],
    ['images', { images: 'no-es-una-lista' }, 'images_invalid'],
  ])('%s inválido ⇒ 400 %s · el freno NO se mide · el corredor NO se llama', async (_n, extra, codigo) => {
    const r = await POST(req(pedido(extra as Record<string, unknown>)))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe(codigo)
    expect(medirFreno).not.toHaveBeenCalled()
    expect(alCorredor).toHaveLength(0)
  })
  it('🔴 con la base caída (el freno NO responde nunca) un pedido inválido igual sale al instante · no espera 8 min ni dispara la alerta', async () => {
    medirFreno.mockImplementation(() => new Promise(() => {}))
    const t0 = Date.now()
    const r = await POST(req(pedido({ thinking_mode: 'invalido' })))
    expect(r.status).toBe(400)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(medirFreno).not.toHaveBeenCalled()
  })
})

describe('lo de siempre NO cambia: un pedido válido SÍ mide el freno (antes de llamar al corredor)', () => {
  it('válido ⇒ se mide el freno una vez y el pedido llega al corredor con sus campos', async () => {
    const r = await POST(req(pedido({ dry_run: false, max_budget_usd: 1, thinking_mode: 'disabled' })))
    expect(r.status).toBe(200)
    expect(medirFreno).toHaveBeenCalledTimes(1)
    expect(alCorredor[0]).toMatchObject({ max_budget_usd: 1, thinking_mode: 'disabled' })
  })
  it('sin campos opcionales: se mide el freno y el cuerpo es el de siempre (sin las claves nuevas)', async () => {
    await POST(req(pedido({ dry_run: false })))
    expect(medirFreno).toHaveBeenCalledTimes(1)
    expect(Object.prototype.hasOwnProperty.call(alCorredor[0], 'max_budget_usd')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(alCorredor[0], 'thinking_mode')).toBe(false)
  })
  it('un pedido válido con el freno EXCEDIDO sigue siendo 429 (el freno sigue mandando)', async () => {
    medirFreno.mockResolvedValue({ blocked: true, spent_usd: 9, cap_usd: 8 })
    const r = await POST(req(pedido({ dry_run: false })))
    expect(r.status).toBe(429)
    expect(alCorredor).toHaveLength(0)
  })
})
