/**
 * RELEVO 38 · `design-image-prompt-engineer` a `claude-sonnet-5-5` por la FILA del agente · pruebas PERMANENTES, US$ 0, sin red ni modelo.
 * Lo que cuidan:
 *   ① una fila con `model = claude-sonnet-5-5` corre en ese id exacto (y el libro lo registra con el precio oficial 2/10);
 *   ② el alias `claude-sonnet` SIGUE en Sonnet 4.6 y las demás filas no cambian de modelo ni de costo;
 *   ③ `model_override` NO se abrió: `claude-sonnet-5-5` sigue fuera de la lista corta (decisión aparte);
 *   ④ una fila con un modelo que el corredor no conoce cae al alias de siempre (no corre en un id inventado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let modeloDeLaFila = 'claude-sonnet'
const opcionesDelSdk: Array<Record<string, unknown>> = []
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (arg: { options?: Record<string, unknown> }) => {
    opcionesDelSdk.push(arg?.options ?? {})
    return (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 's1' }
      yield { type: 'assistant', message: { content: [{ type: 'text', text: '{"prompts":[]}' }] } }
      yield { type: 'result', subtype: 'success', stop_reason: 'end_turn', session_id: 's1', usage: { input_tokens: 1000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }
    })()
  },
}))
const escrituras: Array<{ tabla: string; op: string; contenido?: Record<string, unknown> }> = []
function cadena(tabla: string): any {
  const q: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'gte', 'order', 'limit', 'is', 'neq']) q[m] = () => q
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'design-image-prompt-engineer', identity_content: 'Eres el ingeniero de prompts.', model: modeloDeLaFila } : null, error: null })
  q.single = q.maybeSingle
  for (const op of ['insert', 'upsert', 'update']) q[op] = (contenido?: Record<string, unknown>) => { escrituras.push({ tabla, op, contenido }); return q }
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === 'agents' ? null : [], error: null }).then(r)
  return q
}
vi.mock('../supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => cadena(t) }), getSupabase: () => ({}), supabase: null }))
vi.mock('../brain-enrichment', () => ({
  enrichSystemPromptWithClientBrain: async () => ({ brain_hit: false, brain_chunks_count: 0, brain_query_ms: 0, cost_usd: 0, enrichment: '', evidence_refs: [], grounding: 'prose_only' }),
}))
vi.mock('../braintrust', () => ({ instrumentClaudeAgentSdk: (sdk: unknown) => sdk, flushBraintrust: async () => {} }))

const { runAgentViaSDK, _costFor } = await import('../agent-sdk-runner')
const { MODELOS_POR_CORRIDA, resolverModelo } = await import('../modelo-por-corrida')

const corrida = (extra: Record<string, unknown> = {}) =>
  runAgentViaSDK({ agentName: 'design-image-prompt-engineer', task: 'trivial', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'prueba', forceRestart: true, dryRun: false, ...extra } as never)
const turno = () => new Promise((r) => setTimeout(r, 20))
const filaDelLibro = () => escrituras.find((e) => e.tabla === 'agent_invocations' && e.op === 'insert')?.contenido as Record<string, any>

beforeEach(() => { modeloDeLaFila = 'claude-sonnet'; opcionesDelSdk.length = 0; escrituras.length = 0 })

describe('① la fila con claude-sonnet-5-5 corre en Sonnet 5.5', () => {
  it('el SDK recibe model = claude-sonnet-5-5 y el libro lo deja como modelo efectivo', async () => {
    modeloDeLaFila = 'claude-sonnet-5-5'
    const r = await corrida()
    expect(r.success).toBe(true)
    expect(opcionesDelSdk.at(-1)?.model).toBe('claude-sonnet-5-5')
    await turno()
    expect(filaDelLibro().model).toBe('claude-sonnet-5-5')
    expect(filaDelLibro().metadata.effective_model).toBe('claude-sonnet-5-5')
  })
  it('el costo usa el precio OFICIAL (2 entrada / 10 salida): 1.000 + 1.000 tokens = US$ 0,012, no los 0,018 de Sonnet 4.6', async () => {
    modeloDeLaFila = 'claude-sonnet-5-5'
    const r = await corrida()
    expect(r.costUsd).toBeCloseTo(1000 * 2e-6 + 1000 * 10e-6, 9)
    expect(_costFor('claude-sonnet-4-6', 1000, 1000)).toBeCloseTo(0.018, 9)
  })
})

describe('② nada más cambia', () => {
  it('el alias `claude-sonnet` sigue en claude-sonnet-4-6 (con su costo de siempre)', async () => {
    modeloDeLaFila = 'claude-sonnet'
    const r = await corrida()
    expect(opcionesDelSdk.at(-1)?.model).toBe('claude-sonnet-4-6')
    expect(r.costUsd).toBeCloseTo(0.018, 9)
  })
  it.each([
    ['claude-haiku', 'claude-haiku-4-5-20251001'],
    ['claude-sonnet-4-6', 'claude-sonnet-4-6'],
    ['claude-opus', 'claude-opus-4-6'],
  ])('la fila %s corre en %s, igual que antes', async (fila, esperado) => {
    modeloDeLaFila = fila
    await corrida()
    expect(opcionesDelSdk.at(-1)?.model).toBe(esperado)
  })
  it('un pedido con model_override sigue mandando sobre la fila (la fila en Sonnet 5.5 no lo impide)', async () => {
    modeloDeLaFila = 'claude-sonnet-5-5'
    await corrida({ modelOverride: 'claude-opus-5-5' })
    expect(opcionesDelSdk.at(-1)?.model).toBe('claude-opus-5-5')
  })
})

describe('③ model_override NO se abrió', () => {
  it('claude-sonnet-5-5 no está en la lista corta y resolverModelo lo rechaza', () => {
    expect(MODELOS_POR_CORRIDA as readonly string[]).not.toContain('claude-sonnet-5-5')
    expect(resolverModelo('claude-sonnet-5-5').ok).toBe(false)
  })
})

describe('④ una fila con un modelo desconocido no corre en un id inventado', () => {
  it('cae al alias de siempre (Sonnet 4.6)', async () => {
    modeloDeLaFila = 'claude-sonnet-9-9'
    await corrida()
    expect(opcionesDelSdk.at(-1)?.model).toBe('claude-sonnet-4-6')
  })
})
