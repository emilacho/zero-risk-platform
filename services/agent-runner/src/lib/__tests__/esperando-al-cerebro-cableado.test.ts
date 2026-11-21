/**
 * Encargo 15 · ADENDA 1 (firma de Emilio 21-nov) · EL CABLEADO REAL del corredor: cuando la consulta al cerebro FALLA,
 * `runAgentViaSDK` detiene el paso ANTES de llamar al modelo (US$ 0), avisa UNA vez y el mismo paso retoma cuando el
 * cerebro vuelve. 0 resultados no detiene; el seco tampoco. Molde del SDK y de la base (patrón de `empuje-apagado-por-el-pedido`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let vecesQueCorrioElModelo = 0
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () => {
    vecesQueCorrioElModelo++
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
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'content-creator', identity_content: 'Eres el creador.', model: 'claude-sonnet' } : null, error: null })
  q.single = q.maybeSingle
  for (const op of ['insert', 'upsert', 'update']) q[op] = () => q
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === 'agents' ? null : [], error: null }).then(r)
  return q
}
vi.mock('../supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => cadena(t) }), getSupabase: () => ({}), supabase: null }))
vi.mock('../braintrust', () => ({ instrumentClaudeAgentSdk: (sdk: unknown) => sdk, flushBraintrust: async () => {} }))

const FALLO = { brain_hit: false, brain_chunks_count: 0, chunks_used: 0, brain_query_ms: 106, tokens_used: 0, cost_usd: 0, enrichment: '', evidence_refs: [], grounding: 'prose_only', error: 'embed_query_failed', brain_fallo: true, brain_error_detalle: 'el proveedor de huellas respondió 429 · insufficient_quota · credit_balance_exhausted' }
const ACIERTO = { brain_hit: true, brain_chunks_count: 3, chunks_used: 3, brain_query_ms: 40, tokens_used: 9, cost_usd: 0.0001, enrichment: 'TROZOS-DEL-CEREBRO', evidence_refs: ['t1'], grounding: 'prose_only' }
const VACIO = { ...FALLO, error: 'brain_empty_for_client', brain_fallo: undefined, brain_error_detalle: undefined }
const empuje = vi.fn(async (_a?: unknown) => FALLO as never)
vi.mock('../brain-enrichment', () => ({ enrichSystemPromptWithClientBrain: (a: unknown) => empuje(a) }))
const aviso = vi.fn(async (_a: { agente: string; cliente: string | null | undefined; motivo: string }) => ({ entregada: true, detalle: 'abrio: publicado' }))
vi.mock('../esperando-al-cerebro', async (importOriginal) => {
  const real = await importOriginal<typeof import('../esperando-al-cerebro')>()
  return { ...real, avisarEsperaAlCerebro: aviso }
})

const { runAgentViaSDK } = await import('../agent-sdk-runner')
const corrida = (extra?: Record<string, unknown>) =>
  runAgentViaSDK({ agentName: 'content-creator', task: 'reel de olón', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'mesa', forceRestart: true, dryRun: false, ...(extra ?? {}) } as never)
beforeEach(() => { vecesQueCorrioElModelo = 0; empuje.mockClear(); empuje.mockResolvedValue(FALLO as never); aviso.mockClear() })

describe('🔴 la consulta al cerebro FALLA → el paso se detiene ANTES del modelo', () => {
  it('success false, estado «esperando_al_cerebro» con el motivo real, el modelo NO corre y la alarma salió UNA vez', async () => {
    const r: any = await corrida()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/^esperando_al_cerebro: /)
    expect(r.error).toContain('429 · insufficient_quota · credit_balance_exhausted')
    expect(vecesQueCorrioElModelo).toBe(0)
    expect(r.costUsd).toBe(0)
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(aviso.mock.calls[0][0]).toMatchObject({ agente: 'content-creator', cliente: 'c1' })
    expect(aviso.mock.calls[0][0].motivo).toContain('insufficient_quota')
    expect(r.brainEnrichment).toMatchObject({ brain_fallo: true, alarma_entregada: true, brain_error: 'embed_query_failed' })
    expect(r.brainEnrichment.brain_error_detalle).toContain('429')
  })
  it('una alarma que no se entrega NO cambia la detención: el paso igual queda esperando, con `alarma_entregada: false`', async () => {
    aviso.mockResolvedValueOnce({ entregada: false, detalle: 'sin ZR_PLATFORM_URL o INTERNAL_API_KEY en el entorno del corredor' })
    const r: any = await corrida()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/^esperando_al_cerebro: /)
    expect(r.brainEnrichment.alarma_entregada).toBe(false)
  })
  it('retoma: el MISMO paso, con el cerebro de vuelta, corre con los trozos (la prueba sabotaje-de-llave → llave buena de la ADENDA)', async () => {
    const detenido: any = await corrida()
    expect(detenido.success).toBe(false)
    expect(vecesQueCorrioElModelo).toBe(0)
    empuje.mockResolvedValue(ACIERTO as never)
    const retomado: any = await corrida()
    expect(retomado.success).toBe(true)
    expect(vecesQueCorrioElModelo).toBe(1)
    expect(retomado.brainEnrichment).toMatchObject({ brain_hit: true, brain_chunks_count: 3 })
  })
})

describe('lo que NO detiene', () => {
  it('0 resultados (`brain_empty_for_client`): el agente corre igual y queda anotado, sin alarma', async () => {
    empuje.mockResolvedValue(VACIO as never)
    const r: any = await corrida()
    expect(r.success).toBe(true)
    expect(vecesQueCorrioElModelo).toBe(1)
    expect(aviso).not.toHaveBeenCalled()
  })
  it('el seco (dryRun) no se detiene ni avisa: no crea nada y sirve para probar sin el cerebro', async () => {
    const r: any = await corrida({ dryRun: true })
    expect(r.success).toBe(true)
    expect(vecesQueCorrioElModelo).toBe(0)
    expect(aviso).not.toHaveBeenCalled()
  })
})
