/**
 * ARQ 2026-09-30 · EL CORREDOR ENTREGA LA VUELTA · lado de Vercel (CC#1 · quien construye no certifica).
 *
 * Lo que se demuestra:
 *   · con `callback_mode:"runner"` + agente elegible: el corredor recibe la dirección + la clave del despacho, y `run-sdk`
 *     NO reenvía la vuelta ni cierra el libro (lo hace el corredor) ⇒ una sola vuelta, no dos
 *   · SIN la palanca, o con un agente NO elegible (descubrimiento · revisión editorial · fuera de la lista): el camino de
 *     SIEMPRE, byte a byte (Vercel reenvía la vuelta y cierra el libro)
 *   · un `_runner_delivery` que llegue de afuera no vale
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }),
}))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: vi.fn().mockResolvedValue({ blocked: false }) }))

const promesas: Promise<unknown>[] = []
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { promesas.push(p) } }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'insert', 'update', 'upsert']) q[m] = () => q
      q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r)
      q.maybeSingle = async () => ({ data: null, error: null })
      q.single = async () => ({ data: null, error: null })
      return q
    },
  }),
}))
const registrar = vi.fn().mockResolvedValue({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', idempotent: false })
const running = vi.fn().mockResolvedValue(undefined)
const terminal = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/agent-dispatch-ledger', async (orig) => ({
  ...(await orig<typeof import('@/lib/agent-dispatch-ledger')>()),
  recordDispatchIntent: (...a: unknown[]) => registrar(...a),
  markDispatchRunning: (...a: unknown[]) => running(...a),
  markDispatchTerminal: (...a: unknown[]) => terminal(...a),
}))
const reenviar = vi.fn().mockResolvedValue({ ok: true, status: 'ok', status_code: 200, duration_ms: 5, attempts: 1 })
vi.mock('@/lib/agent-async-callback', async (orig) => ({
  ...(await orig<typeof import('@/lib/agent-async-callback')>()),
  dispatchAsyncCallback: (...a: unknown[]) => reenviar(...a),
}))

import {
  POST,
  vueltaPorElCorredorElegible,
  buildInnerRequestWithoutCallback,
  AGENTES_CON_VUELTA_POR_EL_CORREDOR,
} from '@/app/api/agents/run-sdk/route'

const N8N = 'https://n8n-production-72be.up.railway.app/webhook-waiting/900?signature=abc'
const pedido = (extra: Record<string, unknown> = {}) => ({
  agent: 'campaign-brief-agent', task: 'trivial', client_id: null, workflow_id: 'WF1', workflow_execution_id: '900', step_name: 'brief',
  callback_url: N8N, ...extra,
})
const req = (body: Record<string, unknown>) =>
  new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(body) })

let alCorredor: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
function corredorResponde(res: () => Response) {
  alCorredor = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    alCorredor.push({ url: String(url), cuerpo: JSON.parse(init.body) })
    return res()
  }))
}
const RESPUESTA_LARGA_OK = () =>
  new Response(JSON.stringify({ success: true, response: 'texto', sessionId: null, model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.1, durationMs: 5 }), { status: 200, headers: { 'content-type': 'application/json' } })
const ACUSE_202 = () => new Response(JSON.stringify({ accepted: true, delivered_by: 'runner' }), { status: 202, headers: { 'content-type': 'application/json' } })

async function correrElPedido(body: Record<string, unknown>) {
  promesas.length = 0
  const r = await POST(req(body))
  await Promise.all(promesas)
  return r
}

beforeEach(() => {
  vi.clearAllMocks()
  registrar.mockResolvedValue({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', idempotent: false })
  process.env.INTERNAL_API_KEY = 'k'
  process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
})

describe('la elegibilidad', () => {
  it('sólo con palanca + agente de la lista', () => {
    expect(vueltaPorElCorredorElegible(pedido() as never).elegible).toBe(false) // sin palanca
    expect(vueltaPorElCorredorElegible(pedido({ callback_mode: 'runner' }) as never).elegible).toBe(true)
    expect(vueltaPorElCorredorElegible(pedido({ context: { callback_mode: 'runner' } }) as never).elegible).toBe(true)
    expect(vueltaPorElCorredorElegible(pedido({ callback_mode: 'vercel' }) as never).elegible).toBe(false)
  })
  it('🔴 descubrimiento (persiste al cerebro en Vercel) y agentes fuera de la lista NO son elegibles aunque pidan la palanca', () => {
    expect(vueltaPorElCorredorElegible(pedido({ agent: 'onboarding-specialist', callback_mode: 'runner' }) as never)).toMatchObject({ elegible: false })
    expect(vueltaPorElCorredorElegible(pedido({ agent: 'jefe-marketing', callback_mode: 'runner' }) as never)).toMatchObject({ elegible: false })
    expect(AGENTES_CON_VUELTA_POR_EL_CORREDOR).toEqual(['campaign-brief-agent'])
  })
  it('el pedido interno lleva la entrega delegada, y un `_runner_delivery` de afuera se PISA', async () => {
    const cuerpo = pedido({ _runner_delivery: { callback_url: 'https://evil.test/x', dispatch_key: 'x' } })
    const con = await buildInnerRequestWithoutCallback(req(cuerpo), cuerpo as never, { callback_url: N8N, dispatch_key: 'K' }).json()
    expect(con._runner_delivery).toEqual({ callback_url: N8N, dispatch_key: 'K' })
    expect(con.callback_url).toBeUndefined()
    const sin = await buildInnerRequestWithoutCallback(req(cuerpo), cuerpo as never).json()
    expect(sin._runner_delivery).toBeUndefined()
  })
})

describe('el recorrido completo (Vercel → corredor)', () => {
  it('🔴 ④ con la palanca: el corredor recibe la dirección + la clave; Vercel NO reenvía la vuelta ni cierra el libro', async () => {
    corredorResponde(ACUSE_202)
    const r = await correrElPedido(pedido({ callback_mode: 'runner' }))
    expect(r.status).toBe(202)
    expect(alCorredor).toHaveLength(1)
    expect(alCorredor[0].cuerpo).toMatchObject({ callback_mode: 'runner', callback_url: N8N, dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', agentName: 'campaign-brief-agent' })
    expect(reenviar).not.toHaveBeenCalled() // ← UNA vuelta: la del corredor
    expect(terminal).not.toHaveBeenCalled() // ← el libro lo cierra el corredor
    expect(running).toHaveBeenCalledTimes(1)
  })
  it('el gancho de la prueba (test_delay_ms) viaja al corredor', async () => {
    corredorResponde(ACUSE_202)
    await correrElPedido(pedido({ callback_mode: 'runner', dry_run: true, test_delay_ms: 900000 }))
    expect(alCorredor[0].cuerpo).toMatchObject({ dryRun: true, test_delay_ms: 900000 })
  })
  it('el gancho viaja también SIN palanca (para probar el camino viejo) pero SÓLO con dry_run: en una corrida real no viaja NUNCA', async () => {
    corredorResponde(RESPUESTA_LARGA_OK)
    await correrElPedido(pedido({ dry_run: true, test_delay_ms: 900000 }))
    expect(alCorredor[0].cuerpo).toMatchObject({ dryRun: true, test_delay_ms: 900000 })
    expect(alCorredor[0].cuerpo.callback_mode).toBeUndefined()
    corredorResponde(RESPUESTA_LARGA_OK)
    await correrElPedido(pedido({ test_delay_ms: 900000 }))
    expect(alCorredor[0].cuerpo.test_delay_ms).toBeUndefined()
    corredorResponde(ACUSE_202)
    await correrElPedido(pedido({ callback_mode: 'runner', test_delay_ms: 900000 }))
    expect(alCorredor[0].cuerpo.test_delay_ms).toBeUndefined()
  })
  it('🔴 ② SIN la palanca: el camino de SIEMPRE · el corredor no recibe nada nuevo y Vercel reenvía la vuelta y cierra el libro', async () => {
    corredorResponde(RESPUESTA_LARGA_OK)
    const r = await correrElPedido(pedido())
    expect(r.status).toBe(202)
    expect(alCorredor[0].cuerpo.callback_mode).toBeUndefined()
    expect(alCorredor[0].cuerpo.callback_url).toBeUndefined()
    expect(alCorredor[0].cuerpo.dispatch_key).toBeUndefined()
    expect(reenviar).toHaveBeenCalledTimes(1)
    expect(terminal).toHaveBeenCalledWith(expect.anything(), 'dispatch:WF1:campaign-brief-agent:900', 'completed')
  })
  it('palanca en un agente NO elegible (descubrimiento): se ignora, camino de siempre', async () => {
    corredorResponde(RESPUESTA_LARGA_OK)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await correrElPedido(pedido({ agent: 'onboarding-specialist', callback_mode: 'runner' }))
    expect(alCorredor[0].cuerpo.callback_mode).toBeUndefined()
    expect(reenviar).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('IGNORADO'))).toBe(true)
    warn.mockRestore()
  })
  it('🔴 ③ si el corredor RECHAZA la dirección (400 callback_url_not_allowed): NADIE la llama (ni el corredor ni Vercel), el libro cierra en error y se dice fuerte', async () => {
    corredorResponde(() => new Response(JSON.stringify({ success: false, error: 'callback_url_not_allowed', code: 'E-CALLBACK-HOST' }), { status: 400, headers: { 'content-type': 'application/json' } }))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await correrElPedido(pedido({ callback_mode: 'runner', callback_url: 'https://evil.example.com/webhook-waiting/1' }))
    expect(reenviar).not.toHaveBeenCalled() // ← Vercel tampoco llama a esa dirección
    expect(terminal).toHaveBeenCalledWith(expect.anything(), 'dispatch:WF1:campaign-brief-agent:900', 'error')
    expect(err.mock.calls.some((c) => String(c[0]).includes('RECHAZÓ'))).toBe(true)
    err.mockRestore()
  })
})
