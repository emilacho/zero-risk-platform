/**
 * 04-nov · la corrida COMPLETA del corredor (en seco) escribe el trabajo en columnas propias de `agent_invocations`,
 * y el id de la fila es el que devuelve. Mismo montaje que `libro-de-costos-corrida.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: () => (async function* () {})() }))
const escrituras: Array<{ tabla: string; op: string; contenido?: Record<string, unknown> }> = []
function cadena(tabla: string): any {
  const q: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'gte', 'order', 'limit', 'is', 'neq']) q[m] = () => q
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'social-media-strategist', identity_content: 'x'.repeat(200), model: 'claude-sonnet', status: 'active' } : null, error: null })
  q.single = q.maybeSingle
  for (const op of ['insert', 'upsert', 'update']) q[op] = (contenido?: Record<string, unknown>) => { escrituras.push({ tabla, op, contenido }); return q }
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === 'agents' ? null : [], error: null }).then(r)
  return q
}
vi.mock('../supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => cadena(t) }), getSupabase: () => ({}), supabase: {} }))
vi.mock('../brain-enrichment', () => ({ enrichSystemPromptWithClientBrain: async () => ({ brain_hit: false, brain_chunks_count: 0, brain_query_ms: 0, brain_cost_usd: 0 }) }))
vi.mock('../braintrust', () => ({ instrumentClaudeAgentSdk: (sdk: unknown) => sdk, flushBraintrust: async () => {} }))
const { runAgentViaSDK } = await import('../agent-sdk-runner')
const { trabajoDeLaLlamada } = await import('../trabajo-de-la-llamada')

const corrida = (extra: Record<string, unknown> = {}) =>
  runAgentViaSDK({ agentName: 'social-media-strategist', task: 'trivial', clientId: 'c1', workflowId: 'wf', workflowExecutionId: 'ex', dryRun: true, ...extra } as never)
const turno = () => new Promise((r) => setTimeout(r, 20))
const fila = () => escrituras.find((e) => e.tabla === 'agent_invocations' && e.op === 'insert')?.contenido as Record<string, any>
beforeEach(() => { escrituras.length = 0 })

describe('la fila de la llamada', () => {
  it('guarda el trabajo, el paso y el padre en columnas, y devuelve su propio id', async () => {
    const r = await corrida({ trabajo: trabajoDeLaLlamada({ trabajo_tipo: 'pedido', trabajo_id: 'p1', paso: 'consolidar', llamada_padre: 'i1' }) })
    await turno()
    expect(fila()).toMatchObject({ trabajo_tipo: 'pedido', trabajo_id: 'p1', paso: 'consolidar', llamada_padre: 'i1' })
    expect(r.invocationId).toBeTruthy()
    expect(fila().id).toBe(r.invocationId)
  })
  it('sin datos no menciona las columnas: la fila queda como siempre', async () => {
    await corrida()
    await turno()
    for (const c of ['trabajo_tipo', 'trabajo_id', 'paso', 'llamada_padre']) expect(fila()).not.toHaveProperty(c)
    expect(fila().metadata).not.toHaveProperty('trabajo_invalido')
  })
  it('lo mal escrito no frena la corrida y queda anotado', async () => {
    const r = await corrida({ trabajo: trabajoDeLaLlamada({ trabajo_tipo: 'reunion', trabajo_id: 'x' }) })
    await turno()
    expect(r.success).toBe(true)
    expect(fila()).not.toHaveProperty('trabajo_tipo')
    expect(fila().metadata.trabajo_invalido).toEqual(['trabajo_tipo_desconocido'])
  })
})
