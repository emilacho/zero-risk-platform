/**
 * Encargo 13 (21-nov) · EL CABLEADO REAL: `runAgentViaSDK` usa el empuje de fuente cruda cuando el pedido trae
 * `extra.fidelity_judge: true`, y el empuje de siempre para todos los demás. Molde del SDK y la base (patrón de
 * `empuje-apagado-por-el-pedido`). US$ 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let promptRecibido = ''
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (p: { options: Record<string, unknown> }) => {
    promptRecibido = JSON.stringify(p.options.systemPrompt ?? '')
    return (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 's1' }
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'listo' }] } }
      yield { type: 'result', subtype: 'success', session_id: 's1', usage: { input_tokens: 10, output_tokens: 5 } }
    })()
  },
}))
function cadena(tabla: string): any {
  const q: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'gte', 'order', 'limit', 'is', 'neq']) q[m] = () => q
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'editor-en-jefe', identity_content: 'Eres el editor.', model: 'claude-sonnet' } : null, error: null })
  q.single = q.maybeSingle
  for (const op of ['insert', 'upsert', 'update']) q[op] = () => q
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === 'agents' ? null : [], error: null }).then(r)
  return q
}
vi.mock('../supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => cadena(t) }), getSupabase: () => ({}), supabase: null }))
vi.mock('../braintrust', () => ({ instrumentClaudeAgentSdk: (sdk: unknown) => sdk, flushBraintrust: async () => {} }))

const ACIERTO = (texto: string, push?: string) => ({ brain_hit: true, brain_chunks_count: 2, chunks_used: 2, brain_query_ms: 30, tokens_used: 9, cost_usd: 0.0001, enrichment: texto, evidence_refs: ['t1'], grounding: 'prose_only', ...(push ? { brain_push: push } : {}) })
const empuje = vi.fn(async (_a?: unknown) => ACIERTO('TROZOS-DE-SIEMPRE') as never)
vi.mock('../brain-enrichment', () => ({ enrichSystemPromptWithClientBrain: (a: unknown) => empuje(a) }))
const cruda = vi.fn(async (_a?: unknown) => ACIERTO('<fuente rotulo="x" tipo="primaria_propia">SOLO-CRUDA</fuente>', 'solo_fuente_cruda_del_juez') as never)
vi.mock('../juez-fuente-cruda', async (importOriginal) => {
  const real = await importOriginal<typeof import('../juez-fuente-cruda')>()
  return { ...real, fuenteCrudaParaElJuez: (a: unknown) => cruda(a) }
})

const { runAgentViaSDK } = await import('../agent-sdk-runner')
const corrida = (extra?: Record<string, unknown>) =>
  runAgentViaSDK({ agentName: 'editor-en-jefe', task: 'FIDELIDAD del manual', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'manual-juez-fidelidad', forceRestart: true, dryRun: false, ...(extra !== undefined ? { extra } : {}) } as never)
beforeEach(() => { promptRecibido = ''; empuje.mockClear(); cruda.mockClear() })

describe('🔴 el juez recibe SOLO fuente cruda; los demás, el empuje de siempre', () => {
  it('con `fidelity_judge: true` corre el empuje crudo (y SOLO ese), y el pedido del agente lleva la fuente con su procedencia', async () => {
    const r: any = await corrida({ fidelity_judge: true })
    expect(r.success).toBe(true)
    expect(cruda).toHaveBeenCalledTimes(1)
    expect(empuje).not.toHaveBeenCalled()
    expect(promptRecibido).toContain('SOLO-CRUDA')
    expect(promptRecibido).not.toContain('TROZOS-DE-SIEMPRE')
    expect(r.brainEnrichment).toMatchObject({ brain_hit: true, brain_push: 'solo_fuente_cruda_del_juez' })
  })
  it('sin el marcador (u otro valor) corre el empuje de siempre y el crudo ni se llama', async () => {
    for (const extra of [undefined, {}, { fidelity_judge: false }, { fidelity_judge: 'true' }]) {
      empuje.mockClear(); cruda.mockClear()
      const r: any = await corrida(extra as never)
      expect(r.success).toBe(true)
      expect(empuje).toHaveBeenCalledTimes(1)
      expect(cruda).not.toHaveBeenCalled()
    }
    expect(promptRecibido).toContain('TROZOS-DE-SIEMPRE')
  })
  it('un fallo del empuje crudo detiene el paso «esperando al cerebro» (la regla del encargo 15 también protege al juez)', async () => {
    cruda.mockResolvedValueOnce({ ...ACIERTO('', 'solo_fuente_cruda_del_juez'), brain_hit: false, brain_chunks_count: 0, enrichment: '', error: 'embed_query_failed', brain_fallo: true, brain_error_detalle: '429 · insufficient_quota' } as never)
    const r: any = await corrida({ fidelity_judge: true })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/^esperando_al_cerebro: /)
  })
  it('`sin_fuente_cruda` (0 trozos crudos) NO detiene: el juez corre con la evidencia de su pedido', async () => {
    cruda.mockResolvedValueOnce({ ...ACIERTO('', 'solo_fuente_cruda_del_juez'), brain_hit: false, brain_chunks_count: 0, enrichment: '', error: 'sin_fuente_cruda' } as never)
    const r: any = await corrida({ fidelity_judge: true })
    expect(r.success).toBe(true)
    expect(promptRecibido).not.toContain('fuente rotulo')
  })
})
