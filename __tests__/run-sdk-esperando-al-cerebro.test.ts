/**
 * Encargo 15 · 🟡 de CC6 en #1270 (e7, e8, e14, e15) · la puerta `run-sdk` ante «esperando al cerebro», con la vuelta
 * del corredor SIMULADA (ningún modelo, ninguna red real):
 *  · e8 · el paso detenido vuelve 503 (reintentable para n8n), nunca 500;
 *  · e14 · la puerta decide por `brain_fallo` (el dato), no solo por el texto del error;
 *  · e7 · si el corredor YA entregó la alarma, la puerta NO suena una segunda (regla «menos ruido»);
 *  · e15 · el motivo real (`brain_error_detalle`) no se pierde en el proxy: viaja en la respuesta y en la alarma de respaldo.
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
vi.mock('@/lib/agent-dispatch-ledger', async (orig) => ({
  ...(await orig<typeof import('@/lib/agent-dispatch-ledger')>()),
  recordDispatchIntent: vi.fn().mockResolvedValue({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:902', idempotent: false }),
  markDispatchRunning: vi.fn().mockResolvedValue(undefined),
  markDispatchTerminal: vi.fn().mockResolvedValue(undefined),
}))
// la puerta única de alarmas: se cuenta CADA llamada (e7: ninguna segunda alarma si el corredor ya avisó)
const aviso = vi.fn().mockResolvedValue({ accion: 'abrio', detalle: 'publicado' })
vi.mock('@/lib/portero-alimenta/alertas', async (orig) => ({
  ...(await orig<typeof import('@/lib/portero-alimenta/alertas')>()),
  avisarPorIncidente: () => aviso,
}))

import { POST } from '@/app/api/agents/run-sdk/route'

const DETALLE = 'el proveedor de huellas respondió 429 · insufficient_quota · credit_balance_exhausted'
const pedido = { agent: 'campaign-brief-agent', task: 'trivial', client_id: null, workflow_id: 'WF1', workflow_execution_id: '902', step_name: 'brief' }
const req = () => new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(pedido) })
const vueltaDelCorredor = (extra: Record<string, unknown>, brain: Record<string, unknown> | null) =>
  new Response(JSON.stringify({ success: false, sessionId: null, model: 'm', inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 3, ...(brain ? { brainEnrichment: { brain_hit: false, brain_chunks_count: 0, brain_query_ms: 5, brain_cost_usd: 0, ...brain } } : {}), ...extra }), { status: 200, headers: { 'content-type': 'application/json' } })

async function correr(res: Response) {
  promesas.length = 0
  vi.stubGlobal('fetch', vi.fn(async () => res))
  const r = await POST(req())
  await Promise.all(promesas)
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  aviso.mockResolvedValue({ accion: 'abrio', detalle: 'publicado' })
  process.env.INTERNAL_API_KEY = 'k'
  process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
})

describe('la puerta run-sdk ante «esperando al cerebro»', () => {
  it('🔴 (e8 · e7 · e15) corredor con brain_fallo y alarma YA entregada → 503 «esperando_al_cerebro», el detalle en brainEnrichment y NINGUNA alarma de respaldo', async () => {
    const { status, cuerpo } = await correr(vueltaDelCorredor(
      { error: `esperando_al_cerebro: la consulta al cerebro falló (embed_query_failed · ${DETALLE})` },
      { brain_error: 'embed_query_failed', brain_fallo: true, brain_error_detalle: DETALLE, alarma_entregada: true },
    ))
    expect(status).toBe(503) // reintentable para n8n: el mismo paso se reintenta cuando el cerebro vuelva
    expect(cuerpo).toMatchObject({ success: false, estado: 'esperando_al_cerebro', alarma: 'entregada por el corredor' })
    expect((cuerpo.brainEnrichment as Record<string, unknown>).brain_error_detalle).toBe(DETALLE) // e15: el proxy no pierde el motivo real
    expect(aviso).not.toHaveBeenCalled() // e7: una alarma por incidente, no una segunda por paso
  })
  it('🔴 (e7 · e15) con la alarma NO entregada por el corredor → UNA alarma de respaldo, clave `cerebro:consulta-fallo` y el motivo con su detalle', async () => {
    const { status, cuerpo } = await correr(vueltaDelCorredor(
      { error: `esperando_al_cerebro: la consulta al cerebro falló (embed_query_failed · ${DETALLE})` },
      { brain_error: 'embed_query_failed', brain_fallo: true, brain_error_detalle: DETALLE, alarma_entregada: false },
    ))
    expect(status).toBe(503)
    expect(cuerpo.alarma).toBe('abrio: publicado')
    expect(aviso).toHaveBeenCalledTimes(1)
    const [texto, clave] = aviso.mock.calls[0] as [string, string]
    expect(clave).toBe('cerebro:consulta-fallo')
    expect(texto).toContain('El cerebro no responde')
    expect(texto).toContain(DETALLE) // e15: el motivo real también en la alarma
    expect(texto).toContain('campaign-brief-agent')
  })
  it('🔴 (e14) la puerta decide por `brain_fallo`, no por el texto: un error genérico con brain_fallo true también es 503', async () => {
    const { status, cuerpo } = await correr(vueltaDelCorredor(
      { error: 'fallo del paso' }, // el texto NO empieza con esperando_al_cerebro
      { brain_fallo: true, brain_error_detalle: DETALLE, alarma_entregada: true },
    ))
    expect(status).toBe(503)
    expect(cuerpo.estado).toBe('esperando_al_cerebro')
  })
  it('🟡 (CC6 j17 en #1273) el proxy NO pierde `brain_push`: el rastro de que el juez recibió solo fuente cruda viaja en la respuesta', async () => {
    const { status, cuerpo } = await correr(new Response(JSON.stringify({
      success: true, response: 'veredicto del juez', sessionId: 's1', model: 'm', inputTokens: 10, outputTokens: 5, costUsd: 0.001, durationMs: 9,
      brainEnrichment: { brain_hit: true, brain_chunks_count: 2, brain_query_ms: 5, brain_cost_usd: 0, brain_push: 'solo_fuente_cruda_del_juez' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    expect(status).toBe(200)
    expect((cuerpo.brain_enrichment as Record<string, unknown>).brain_push).toBe('solo_fuente_cruda_del_juez')
    expect((cuerpo.brain_enrichment as Record<string, unknown>).brain_hit).toBe(true)
  })
  it('la frontera: un fallo normal del corredor (sin brain_fallo y sin «esperando») sigue siendo 500, sin alarma del cerebro', async () => {
    const { status, cuerpo } = await correr(vueltaDelCorredor({ error: 'agente sin identidad' }, null))
    expect(status).toBe(500)
    expect(cuerpo.estado).toBeUndefined()
    expect(aviso).not.toHaveBeenCalled()
  })
})
