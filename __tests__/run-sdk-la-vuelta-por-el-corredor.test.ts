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
    expect(vueltaPorElCorredorElegible(pedido({ agent: 'chief-financial-officer', callback_mode: 'runner' }) as never)).toMatchObject({ elegible: false })
    // ronda 69 · decisión explícita: + los dos agentes de diseño de la oficina (sin efectos propios de Vercel); el texto editorial y el descubrimiento siguen fuera
    // 06-nov · DALE (a) de Emilio: + el redactor del plan
    // 21-nov · GO de Lenovo (opción A): + el agente de los 4 pasos largos de la cadena, solo con la cabecera de saltar el editor
    expect(AGENTES_CON_VUELTA_POR_EL_CORREDOR).toEqual(['campaign-brief-agent', 'carousel-designer', 'design-visual-storyteller', 'director-gran-idea', 'jefe-marketing', 'social-media-strategist'])
    expect(vueltaPorElCorredorElegible(pedido({ agent: 'content-creator', callback_mode: 'runner' }) as never)).toMatchObject({ elegible: false })
  })
  it('🔴 21-nov · la revisión editorial solo deja de impedir la vuelta por el corredor con la cabecera de saltar el editor, y solo para agentes de la lista', () => {
    const estratega = pedido({ agent: 'social-media-strategist', callback_mode: 'runner' }) as never
    expect(vueltaPorElCorredorElegible(estratega)).toMatchObject({ elegible: false, motivo: expect.stringMatching(/editorial/) })
    expect(vueltaPorElCorredorElegible(estratega, { saltaEditor: false })).toMatchObject({ elegible: false, motivo: expect.stringMatching(/editorial/) })
    expect(vueltaPorElCorredorElegible(estratega, { saltaEditor: true })).toEqual({ elegible: true, motivo: 'ok' })
    // otro agente con revisión editorial que NO está en la lista: la cabecera no lo vuelve elegible
    expect(vueltaPorElCorredorElegible(pedido({ agent: 'content-creator', callback_mode: 'runner' }) as never, { saltaEditor: true })).toMatchObject({ elegible: false, motivo: expect.stringMatching(/fuera de la lista/) })
    // el descubrimiento sigue fuera aunque traiga la cabecera
    expect(vueltaPorElCorredorElegible(pedido({ agent: 'onboarding-specialist', callback_mode: 'runner' }) as never, { saltaEditor: true })).toMatchObject({ elegible: false, motivo: expect.stringMatching(/descubrimiento/) })
    // sin la palanca, nada
    expect(vueltaPorElCorredorElegible(pedido({ agent: 'social-media-strategist' }) as never, { saltaEditor: true }).elegible).toBe(false)
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
  it('🔴 11-nov · #21 · el camino de SIEMPRE (sin palanca) también le pasa al corredor la llave del despacho para latir a la base; uno de afuera no vale', async () => {
    corredorResponde(RESPUESTA_LARGA_OK)
    await correrElPedido(pedido({ _latido: { dispatch_key: 'de-afuera' }, latido_dispatch_key: 'de-afuera' }))
    expect(alCorredor).toHaveLength(1)
    expect(alCorredor[0].cuerpo.latido_dispatch_key).toBe('dispatch:WF1:campaign-brief-agent:900')
    expect(alCorredor[0].cuerpo.callback_mode).toBeUndefined()
    // un pedido directo (sin vuelta, sin despacho) no lleva llave del latido aunque la traiga de afuera
    corredorResponde(RESPUESTA_LARGA_OK)
    await correrElPedido({ agent: 'campaign-brief-agent', task: 't', workflow_id: 'WF1', workflow_execution_id: '901', _latido: { dispatch_key: 'de-afuera' } })
    expect(alCorredor[0].cuerpo.latido_dispatch_key).toBeUndefined()
  })
  it('🔴 11-nov · #21 · con la palanca el corredor recibe la misma llave para latir', async () => {
    corredorResponde(ACUSE_202)
    await correrElPedido(pedido({ callback_mode: 'runner' }))
    expect(alCorredor[0].cuerpo).toMatchObject({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', latido_dispatch_key: 'dispatch:WF1:campaign-brief-agent:900' })
  })
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
  it('🔴 06-nov · el redactor del plan (jefe-marketing, 1.534 s en la r4): con la palanca la vuelta la entrega el corredor, no la ruta de 800 s de Vercel', async () => {
    registrar.mockResolvedValue({ dispatch_key: 'dispatch:X9F0zp6LQ2xGEYVS:jefe-marketing:220399', idempotent: false })
    corredorResponde(ACUSE_202)
    const r = await correrElPedido(pedido({ agent: 'jefe-marketing', workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '220399', step_name: 'redactor', callback_mode: 'runner' }))
    expect(r.status).toBe(202)
    expect(alCorredor).toHaveLength(1)
    expect(alCorredor[0].cuerpo).toMatchObject({ callback_mode: 'runner', callback_url: N8N, dispatch_key: 'dispatch:X9F0zp6LQ2xGEYVS:jefe-marketing:220399', agentName: 'jefe-marketing' })
    expect(reenviar).not.toHaveBeenCalled()
    expect(terminal).not.toHaveBeenCalled()
  })
  it('🔴 21-nov · opción A: el agente de los pasos largos de la cadena (social-media-strategist) CON la cabecera de saltar el editor → la vuelta la entrega el corredor', async () => {
    registrar.mockResolvedValue({ dispatch_key: 'dispatch:ZnoFdGfACA36c3qE:social-media-strategist:500', idempotent: false })
    corredorResponde(ACUSE_202)
    const cuerpo = pedido({ agent: 'social-media-strategist', workflow_id: 'ZnoFdGfACA36c3qE', workflow_execution_id: '500', step_name: 'estrategia', callback_mode: 'runner' })
    promesas.length = 0
    const r = await POST(new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k', 'x-skip-editor-middleware': '1' }, body: JSON.stringify(cuerpo) }))
    await Promise.all(promesas)
    expect(r.status).toBe(202)
    expect(alCorredor).toHaveLength(1)
    expect(alCorredor[0].cuerpo).toMatchObject({ callback_mode: 'runner', callback_url: N8N, dispatch_key: 'dispatch:ZnoFdGfACA36c3qE:social-media-strategist:500', agentName: 'social-media-strategist' })
    expect(reenviar).not.toHaveBeenCalled()
    expect(terminal).not.toHaveBeenCalled()
  })
  it('🔴 21-nov · el mismo agente SIN la cabecera: el camino de siempre (Vercel entrega la vuelta; el editor sigue protegido)', async () => {
    registrar.mockResolvedValue({ dispatch_key: 'dispatch:ZnoFdGfACA36c3qE:social-media-strategist:501', idempotent: false })
    corredorResponde(RESPUESTA_LARGA_OK)
    await correrElPedido(pedido({ agent: 'social-media-strategist', workflow_id: 'ZnoFdGfACA36c3qE', workflow_execution_id: '501', step_name: 'estrategia', callback_mode: 'runner' }))
    // sin la cabecera corre además el editor (más llamadas): lo que importa es que NINGUNA va al corredor con la vuelta delegada
    expect(alCorredor.length).toBeGreaterThanOrEqual(1)
    expect(alCorredor[0].cuerpo).toMatchObject({ agentName: 'social-media-strategist' })
    for (const c of alCorredor) { expect(c.cuerpo.callback_mode).toBeUndefined(); expect(c.cuerpo.callback_url).toBeUndefined() }
    expect(terminal).toHaveBeenCalled() // el libro lo cierra Vercel, como siempre
  })
  // 21-nov · 🟡 de CC6 (r2): solo el valor EXACTO '1' salta el editor (como en `route.ts`, que corre el editor con cualquier otro valor). Con '0', 'true' o vacío, el camino de siempre.
  it.each(['0', 'true', ''])('🔴 21-nov · el mismo agente con la cabecera en %j: NO es elegible, el camino de siempre (el editor sigue protegido)', async (valor) => {
    registrar.mockResolvedValue({ dispatch_key: 'dispatch:ZnoFdGfACA36c3qE:social-media-strategist:502', idempotent: false })
    corredorResponde(RESPUESTA_LARGA_OK)
    const cuerpo = pedido({ agent: 'social-media-strategist', workflow_id: 'ZnoFdGfACA36c3qE', workflow_execution_id: '502', step_name: 'estrategia', callback_mode: 'runner' })
    promesas.length = 0
    await POST(new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k', 'x-skip-editor-middleware': valor }, body: JSON.stringify(cuerpo) }))
    await Promise.all(promesas)
    expect(alCorredor.length).toBeGreaterThanOrEqual(1)
    for (const c of alCorredor) { expect(c.cuerpo.callback_mode).toBeUndefined(); expect(c.cuerpo.callback_url).toBeUndefined() }
    expect(terminal).toHaveBeenCalled()
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
