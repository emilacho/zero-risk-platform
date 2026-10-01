/**
 * UNA CORRIDA CORTADA POR TOPE ENTREGA SU TEXTO COMO PARCIAL · el camino de vuelta · pruebas a costo cero · CC#1 · 2026-10-01 (encargo de Emilio · corrida 160410).
 *
 * 🔴 Antes: el corredor sí construía el texto, pero en el camino de vuelta se perdía: (a) la puerta de Vercel devolvía sólo `{success:false, error}` y (b) la vuelta del corredor (`callback_mode:"runner"`)
 * llevaba el costo pero no el texto. Ahora un fallo con tope opt-in (`partial:true`) viaja con lo escrito hasta el corte, MARCADO parcial, y con lo gastado.
 *
 * Lo que se demuestra:
 *   ① Vercel: un resultado `partial` del corredor llega al que pidió con `partial:true`, la causa, el texto y lo gastado · status 500 (sigue siendo un FALLO)
 *   ② Vercel: sin `partial` el cuerpo del fallo es el de siempre, byte a byte (opt-in puro)
 *   ③ la vuelta del corredor: el fallo parcial lleva el texto marcado · el fallo normal sigue sin `response` (nunca un cuerpo que se parezca a un dato · E87)
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
import { cuerpoDeLaVuelta } from '../services/agent-runner/src/lib/entrega-de-la-vuelta'

const TEXTO = '## 1) TITULAR\n\n**Ceviche de Olón, directo a tu puerta**'
const pedido = (extra: Record<string, unknown> = {}) => ({ agent: 'campaign-brief-agent', task: 'trivial', client_id: null, workflow_id: 'WF1', workflow_execution_id: '900', step_name: 'brief', max_budget_usd: 0.12, ...extra })
const req = (b: Record<string, unknown>) => new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) })
const delCorredor = (cuerpo: Record<string, unknown>) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } }))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTERNAL_API_KEY = 'k'
  process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
})

describe('① Vercel entrega el parcial al que pidió', () => {
  it('🔴 resultado parcial del corredor ⇒ 500 con partial:true, la causa, el TEXTO y lo gastado · antes sólo viajaba el error', async () => {
    vi.stubGlobal('fetch', delCorredor({ success: false, error: 'error_max_budget_usd · … PARCIAL', partial: true, partialReason: 'error_max_budget_usd', response: TEXTO, sessionId: 's1', inputTokens: 5200, outputTokens: 1100, costUsd: 0.1234, durationMs: 9, model: 'claude-sonnet-4-6' }))
    const res = await POST(req(pedido()))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: 'error_max_budget_usd · … PARCIAL', partial: true, partial_reason: 'error_max_budget_usd', response: TEXTO, costUsd: 0.1234, inputTokens: 5200, outputTokens: 1100, model: 'claude-sonnet-4-6' })
  })
  it('② sin `partial` el cuerpo del fallo es el de siempre, byte a byte (opt-in puro)', async () => {
    vi.stubGlobal('fetch', delCorredor({ success: false, error: 'agente no cargable', response: 'ruido que no debe viajar', costUsd: 0 }))
    const res = await POST(req(pedido({ max_budget_usd: undefined })))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: 'agente no cargable' })
  })
  it('un `partial` que no es exactamente true no cuenta', async () => {
    vi.stubGlobal('fetch', delCorredor({ success: false, error: 'x', partial: 'true', response: 'texto' }))
    const res = await POST(req(pedido()))
    expect(await res.json()).toEqual({ success: false, error: 'x' })
  })
})

describe('③ la vuelta del corredor (callback_mode:"runner")', () => {
  const ctx = { agentName: 'campaign-brief-agent', dispatchKey: 'dispatch:W:a:1' }
  it('🔴 un fallo parcial lleva el texto MARCADO parcial, las fichas y lo gastado', () => {
    expect(cuerpoDeLaVuelta({ success: false, error: 'corte', partial: true, partialReason: 'error_max_budget_usd', response: TEXTO, costUsd: 0.1234, inputTokens: 5200, outputTokens: 1100, model: 'claude-sonnet-4-6' }, ctx)).toEqual({
      success: false, agent: 'campaign-brief-agent', error: 'corte', error_kind: 'runner_run_failed', cost_usd: 0.1234,
      partial: true, partial_reason: 'error_max_budget_usd', response: TEXTO, input_tokens: 5200, output_tokens: 1100, model: 'claude-sonnet-4-6',
      delivered_by: 'runner', dispatch_key: 'dispatch:W:a:1',
    })
  })
  it('un fallo SIN partial sigue idéntico (nunca un cuerpo que se parezca a un dato · E87): sin response', () => {
    expect(cuerpoDeLaVuelta({ success: false, error: 'saldo agotado', response: 'no debe viajar', costUsd: 0.5 }, ctx)).toEqual({
      success: false, agent: 'campaign-brief-agent', error: 'saldo agotado', error_kind: 'runner_run_failed', cost_usd: 0.5, delivered_by: 'runner', dispatch_key: 'dispatch:W:a:1',
    })
  })
  it('un parcial sin causa explícita se marca «error_del_sdk» y un texto ausente viaja vacío (nunca undefined)', () => {
    const c = cuerpoDeLaVuelta({ success: false, error: 'x', partial: true }, ctx)
    expect(c).toMatchObject({ partial: true, partial_reason: 'error_del_sdk', response: '' })
  })
  it('un éxito no cambia', () => {
    expect(cuerpoDeLaVuelta({ success: true, response: 'hola', costUsd: 0.2 }, ctx)).toMatchObject({ success: true, response: 'hola', delivered_by: 'runner' })
    expect(Object.prototype.hasOwnProperty.call(cuerpoDeLaVuelta({ success: true, response: 'hola' }, ctx), 'partial')).toBe(false)
  })
})
