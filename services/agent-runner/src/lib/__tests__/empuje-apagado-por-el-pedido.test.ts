/**
 * Encargo 9 · 18-nov · la mesa que ya recibe la base y el índice de su pieza apaga el EMPUJE con `extra.sin_empuje: true` (contrato con CC2).
 * Solo `true` lo apaga y queda anotado como `brain_push: "apagado_por_el_pedido"`; cualquier otro uso del corredor sigue igual. Costo cero.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let promptRecibido = ''
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (p: { options: Record<string, any> }) => {
    promptRecibido = JSON.stringify(p.options.systemPrompt ?? '')
    return (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 's1' }
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'listo' }] } }
      yield { type: 'result', subtype: 'success', session_id: 's1', usage: { input_tokens: 10, output_tokens: 5 } }
    })()
  },
}))
const escrito: Array<{ tabla: string; fila: any }> = []
function cadena(tabla: string): any {
  const q: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'gte', 'order', 'limit', 'is', 'neq']) q[m] = () => q
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'content-creator', identity_content: 'Eres el creador.', model: 'claude-sonnet' } : null, error: null })
  q.single = q.maybeSingle
  for (const op of ['insert', 'upsert', 'update']) q[op] = (fila: unknown) => { escrito.push({ tabla, fila }); return q }
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === 'agents' ? null : [], error: null }).then(r)
  return q
}
vi.mock('../supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => cadena(t) }), getSupabase: () => ({}), supabase: null }))
const empuje = vi.fn(async () => ({ brain_hit: true, brain_chunks_count: 4, chunks_used: 4, brain_query_ms: 30, tokens_used: 9, cost_usd: 0.0001, enrichment: 'TROZOS-DEL-EMPUJE', evidence_refs: ['t1'], grounding: 'prose_only' }))
vi.mock('../brain-enrichment', () => ({ enrichSystemPromptWithClientBrain: empuje }))
vi.mock('../braintrust', () => ({ instrumentClaudeAgentSdk: (sdk: unknown) => sdk, flushBraintrust: async () => {} }))

const { runAgentViaSDK } = await import('../agent-sdk-runner')
const { empujeApagadoPorElPedido } = await import('../empuje-del-pedido')

const corrida = (extra?: Record<string, unknown>) =>
  runAgentViaSDK({ agentName: 'content-creator', task: 'reel de olón', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'mesa', forceRestart: true, dryRun: false, ...(extra ? { extra } : {}) } as never)
const metaEscrita = () => escrito.filter((e) => e.fila && typeof e.fila === 'object').map((e) => JSON.stringify(e.fila)).join('\n')
beforeEach(() => { promptRecibido = ''; empuje.mockClear(); escrito.length = 0 })

describe('el empuje se apaga SOLO con `extra.sin_empuje: true`', () => {
  it('🔴 con sin_empuje: true no se busca en el cerebro, no entra ningún trozo y queda anotado «apagado_por_el_pedido»', async () => {
    const r: any = await corrida({ mesa: true, encargo_id: 'e1', sin_empuje: true })
    expect(empuje).not.toHaveBeenCalled()
    expect(promptRecibido).not.toContain('TROZOS-DEL-EMPUJE')
    expect(r.brainEnrichment).toMatchObject({ brain_push: 'apagado_por_el_pedido', brain_hit: false, brain_chunks_count: 0, brain_cost_usd: 0 })
    expect(metaEscrita()).toContain('"brain_push":"apagado_por_el_pedido"')
  })
  it('CONTROL: sin `extra`, o en la mesa sin sin_empuje, el empuje corre como siempre y no se anota nada nuevo', async () => {
    for (const extra of [undefined, { mesa: true, encargo_id: 'e1' }]) {
      empuje.mockClear()
      const r: any = await corrida(extra)
      expect(empuje).toHaveBeenCalledTimes(1)
      expect(promptRecibido).toContain('TROZOS-DEL-EMPUJE')
      expect(r.brainEnrichment.brain_push).toBeUndefined()
    }
  })
  it('cualquier otro valor NO apaga el empuje (ni "true" en texto, ni 1, ni false)', async () => {
    for (const v of ['true', 1, false, null]) {
      empuje.mockClear()
      await corrida({ sin_empuje: v })
      expect(empuje, String(v)).toHaveBeenCalledTimes(1)
    }
    expect(empujeApagadoPorElPedido({ sin_empuje: true })).toBe(true)
    for (const x of [undefined, null, [], 'sin_empuje', { sin_empuje: 'true' }, [{ sin_empuje: true }]]) expect(empujeApagadoPorElPedido(x)).toBe(false)
  })
})
