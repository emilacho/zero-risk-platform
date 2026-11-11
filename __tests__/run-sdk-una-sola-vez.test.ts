/**
 * `una_sola_vez` · 11-nov · colaterales 2d · línea 4 de CC7 (CC1 construye · CC7 certifica).
 * Un reintento con la MISMA llave de despacho no vuelve a correr al agente (no paga dos veces). Sin la opción, todo como hoy:
 * el rescate reusa la llave A PROPÓSITO y SÍ vuelve a correr.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn(), setTag: vi.fn(), withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: vi.fn().mockResolvedValue({ blocked: false }) }))
const promesas: Promise<unknown>[] = []
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { promesas.push(p) } }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'insert', 'update', 'upsert']) q[m] = () => q; q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r); q.maybeSingle = async () => ({ data: null, error: null }); q.single = q.maybeSingle; return q } }),
}))
// el libro de despachos FALSO recuerda las llaves, como el índice único real (23505 ⇒ idempotent: true)
const llaves = new Set<string>()
const registrar = vi.fn(async (_db: unknown, i: { dispatch_key?: string | null }) => {
  const k = i.dispatch_key ?? 'derivada'
  const idempotent = llaves.has(k)
  llaves.add(k)
  return { dispatch_key: k, idempotent }
})
const running = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/agent-dispatch-ledger', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-dispatch-ledger')>()), recordDispatchIntent: (...a: [unknown, { dispatch_key?: string | null }]) => registrar(...a), markDispatchRunning: (...a: unknown[]) => running(...a), markDispatchTerminal: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/agent-async-callback', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-async-callback')>()), dispatchAsyncCallback: vi.fn().mockResolvedValue({ ok: true, status: 'ok', status_code: 200, duration_ms: 1, attempts: 1 }) }))
import { POST } from '@/app/api/agents/run-sdk/route'
import { leerUnaSolaVez } from '@/lib/una-sola-vez'

const N8N = 'https://n8n-production-72be.up.railway.app/webhook-waiting/900?signature=abc'
const LLAVE = 'colaterales:3f1c0d2e-0000-4000-8000-000000000001:secretaria'
const pedido = (extra: Record<string, unknown> = {}) => ({ agent: 'content-creator', task: 'trivial', client_id: null, workflow_id: 'WFCOL', workflow_execution_id: '901', step_name: 'secretaria', callback_url: N8N, dispatch_key: LLAVE, una_sola_vez: true, ...extra })
const req = (b: Record<string, unknown>) => new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) })
let corridas = 0
async function pedir(b: Record<string, unknown>) {
  const r = await POST(req(b))
  await Promise.all(promesas.splice(0))
  return r
}
beforeEach(() => {
  vi.clearAllMocks(); llaves.clear(); promesas.length = 0; corridas = 0
  process.env.INTERNAL_API_KEY = 'k'; process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
  vi.stubGlobal('fetch', vi.fn(async () => { corridas++; return new Response(JSON.stringify({ success: true, response: 'x', costUsd: 0.1 }), { status: 200, headers: { 'content-type': 'application/json' } }) }))
})

describe('🔴 con `una_sola_vez`: la misma llave dos veces = el agente corre UNA vez', () => {
  it('primer pedido corre; el segundo (reintento por corte de red) contesta «ya despachado» y no corre nada', async () => {
    const a = await pedir(pedido())
    expect(a.status).toBe(202)
    const corridasDelPrimero = corridas
    expect(corridasDelPrimero).toBeGreaterThan(0)
    expect(running).toHaveBeenCalledTimes(1)
    const b = await pedir(pedido())
    expect(b.status).toBe(200)
    expect(await b.json()).toEqual({ accepted: false, ya_despachado: true, dispatch_key: LLAVE })
    expect(corridas).toBe(corridasDelPrimero) // ← nada nuevo salió hacia el agente
    expect(running).toHaveBeenCalledTimes(1)
    expect(registrar).toHaveBeenCalledTimes(2)
  })
  it('llaves distintas corren las dos (la opción no frena trabajos distintos)', async () => {
    await pedir(pedido())
    const c1 = corridas
    const b = await pedir(pedido({ dispatch_key: LLAVE.replace('0001', '0002') }))
    expect(b.status).toBe(202)
    expect(corridas).toBeGreaterThan(c1)
    expect(running).toHaveBeenCalledTimes(2)
  })
})

describe('sin la opción, todo como hoy (el rescate reusa la llave a propósito y SÍ vuelve a correr)', () => {
  it.each([['ausente', undefined], ['false', false]])('`una_sola_vez` %s + llave repetida ⇒ el agente corre otra vez', async (_n, valor) => {
    const sin = (x: Record<string, unknown>) => { const c = { ...x }; if (valor === undefined) delete c.una_sola_vez; else c.una_sola_vez = valor; return c }
    await pedir(sin(pedido()))
    const c1 = corridas
    const b = await pedir(sin(pedido()))
    expect(b.status).toBe(202)
    expect(corridas).toBeGreaterThan(c1)
    expect(running).toHaveBeenCalledTimes(2)
  })
})

describe('🔴 la opción mal pedida se rechaza ANTES de registrar o correr nada', () => {
  it.each([
    ['sin vuelta (camino que no registra la llave)', { callback_url: undefined }],
    ['vuelta que no es una dirección válida', { callback_url: 'ftp://x' }],
    ['sin llave explícita', { dispatch_key: undefined }],
    ['llave vacía', { dispatch_key: '   ' }],
    ['no booleana', { una_sola_vez: 'si' }],
  ])('%s ⇒ 400', async (_n, extra) => {
    const b = { ...pedido() } as Record<string, unknown>
    for (const [k, v] of Object.entries(extra)) { if (v === undefined) delete b[k]; else b[k] = v }
    const r = await pedir(b)
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('una_sola_vez_invalida')
    expect(registrar).not.toHaveBeenCalled()
    expect(corridas).toBe(0)
  })
})

describe('leerUnaSolaVez (función pura)', () => {
  it('reglas', () => {
    expect(leerUnaSolaVez({}, true)).toEqual({ activa: false })
    expect(leerUnaSolaVez({ una_sola_vez: false }, false)).toEqual({ activa: false })
    expect(leerUnaSolaVez({ una_sola_vez: true, dispatch_key: 'k' }, true)).toEqual({ activa: true })
    expect(leerUnaSolaVez({ una_sola_vez: true, dispatch_key: 'k' }, false).error).toBeTruthy()
    expect(leerUnaSolaVez({ una_sola_vez: true }, true).error).toBeTruthy()
    expect(leerUnaSolaVez({ una_sola_vez: 1 }, true).error).toBeTruthy()
  })
})
