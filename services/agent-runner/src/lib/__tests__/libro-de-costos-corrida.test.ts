/**
 * Relevo 41 · la corrida COMPLETA del corredor (SDK simulado) anota bien el costo: búsquedas web, Opus 4.6 y el corte por tope que llega sin `usage`. US$ 0, sin red, sin modelo.
 * Mismo montaje que `cerrada-por-tope.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let flujo: Array<Record<string, unknown>> = []
let modeloDelAgente = 'claude-sonnet'
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: () => (async function* () { for (const m of flujo) yield m })() }))
const escrituras: Array<{ tabla: string; op: string; contenido?: Record<string, unknown> }> = []
function cadena(tabla: string): any {
  const q: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'gte', 'order', 'limit', 'is', 'neq']) q[m] = () => q
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'social-media-strategist', identity_content: 'Eres el estratega.', model: modeloDelAgente } : null, error: null })
  q.single = q.maybeSingle
  for (const op of ['insert', 'upsert', 'update']) q[op] = (contenido?: Record<string, unknown>) => { escrituras.push({ tabla, op, contenido }); return q }
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === 'agents' ? null : [], error: null }).then(r)
  return q
}
vi.mock('../supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => cadena(t) }), getSupabase: () => ({}), supabase: null }))
vi.mock('../brain-enrichment', () => ({ enrichSystemPromptWithClientBrain: async () => ({ brain_hit: false, brain_chunks_count: 0, brain_query_ms: 0, cost_usd: 0, enrichment: '', evidence_refs: [], grounding: 'prose_only' }) }))
vi.mock('../braintrust', () => ({ instrumentClaudeAgentSdk: (sdk: unknown) => sdk, flushBraintrust: async () => {} }))
const { runAgentViaSDK } = await import('../agent-sdk-runner')

const INIT = { type: 'system', subtype: 'init', session_id: 's1' }
const texto = (t: string) => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } })
const herramienta = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch', input: { q: 'a' } }] } }
const resultadoHerramienta = { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }
const corrida = (extra: Record<string, unknown> = {}) =>
  runAgentViaSDK({ agentName: 'social-media-strategist', task: 'trivial', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'estrategia', forceRestart: true, dryRun: false, ...extra } as never)
const turno = () => new Promise((r) => setTimeout(r, 20))
const fila = () => escrituras.find((e) => e.tabla === 'agent_invocations' && e.op === 'insert')?.contenido as Record<string, any>
const M = 1_000_000
beforeEach(() => { escrituras.length = 0; modeloDelAgente = 'claude-sonnet' })

describe('las búsquedas web entran al costo y al libro', () => {
  it('4 búsquedas = US$ 0,04 más los tokens; el libro dice cuántas fueron y que la base es «tokens»', async () => {
    flujo = [INIT, texto('Busco.'), herramienta, resultadoHerramienta, texto('Listo.'), { type: 'result', subtype: 'success', stop_reason: 'end_turn', session_id: 's1', usage: { input_tokens: M, output_tokens: 0, server_tool_use: { web_search_requests: 4 } } }]
    const r = await corrida()
    expect(r.costUsd).toBeCloseTo(3 + 0.04, 9) // Sonnet 4.6: 1 millón de entrada = US$ 3
    await turno()
    expect(fila().cost_usd).toBeCloseTo(3.04, 9)
    expect(fila().metadata).toMatchObject({ web_search_requests: 4, cost_basis: 'tokens', cost_is_upper_bound: false })
  })
  it('sin búsquedas el libro dice 0 y el costo es el de siempre', async () => {
    flujo = [INIT, texto('Listo.'), { type: 'result', subtype: 'success', stop_reason: 'end_turn', session_id: 's1', usage: { input_tokens: M, output_tokens: 0 } }]
    const r = await corrida()
    expect(r.costUsd).toBeCloseTo(3, 9)
    await turno()
    expect(fila().metadata.web_search_requests).toBe(0)
  })
})

describe('Opus 4.6 en una corrida real del corredor', () => {
  it('el agente en Opus 4.6: 1 millón de entrada y 100.000 de salida = US$ 5 + 2,5, no 15 + 7,5', async () => {
    modeloDelAgente = 'claude-opus'
    flujo = [INIT, texto('Listo.'), { type: 'result', subtype: 'success', stop_reason: 'end_turn', session_id: 's1', usage: { input_tokens: M, output_tokens: 100_000 } }]
    const r = await corrida()
    expect(r.costUsd).toBeCloseTo(7.5, 9)
    await turno()
    expect(fila().model).toBe('claude-opus-4-6'); expect(fila().cost_usd).toBeCloseTo(7.5, 9)
  })
})

describe('un corte por tope que llega SIN `usage` no queda en US$ 0', () => {
  const corteSinUso = (extra: Record<string, unknown> = {}) => [INIT, texto('Voy.'), herramienta, { type: 'result', subtype: 'error_max_budget_usd', stop_reason: 'tool_use', session_id: 's1', ...extra }]
  it('🔴 sin usage ni total del SDK: se anota el TOPE como cota pesimista, declarada en el libro, y el mensaje de corte lo usa', async () => {
    flujo = corteSinUso()
    const r = await corrida({ maxBudgetUsd: 0.03 })
    expect(r.success).toBe(false)
    expect(r.costUsd).toBeCloseTo(0.03, 9)
    expect(r.error).toMatch(/0[.,]03/)
    await turno()
    expect(fila().cost_usd).toBeCloseTo(0.03, 9)
    expect(fila().status).toBe('failed')
    expect(fila().metadata).toMatchObject({ cost_basis: 'tope_como_cota', cost_is_upper_bound: true })
  })
  it('si el SDK sí informó su total, se anota ese (no el tope) y la base lo dice', async () => {
    flujo = corteSinUso({ total_cost_usd: 0.012 })
    const r = await corrida({ maxBudgetUsd: 0.03 })
    expect(r.costUsd).toBeCloseTo(0.012, 9)
    await turno()
    expect(fila().metadata).toMatchObject({ cost_basis: 'total_del_sdk', cost_is_upper_bound: false })
  })
  it('si hubo usage, manda el cálculo por tokens: el tope no lo sustituye', async () => {
    flujo = corteSinUso({ usage: { input_tokens: 10_000, output_tokens: 1_000 } })
    const r = await corrida({ maxBudgetUsd: 0.5 })
    expect(r.costUsd).toBeCloseTo(0.03 + 0.015, 9)
    await turno()
    expect(fila().metadata.cost_basis).toBe('tokens')
  })
  it('una corrida SANA sin usage y sin tope sigue en 0: no se inventa gasto', async () => {
    flujo = [INIT, texto('Listo.'), { type: 'result', subtype: 'success', stop_reason: 'end_turn', session_id: 's1' }]
    const r = await corrida()
    expect(r.costUsd).toBe(0)
    await turno()
    expect(fila().metadata).toMatchObject({ cost_basis: 'tokens', cost_is_upper_bound: false })
  })
  it('un corte SIN tope pedido (el SDK no lo interpreta como corte) tampoco inventa el tope', async () => {
    flujo = corteSinUso()
    const r = await corrida()
    expect(r.costUsd).toBe(0)
  })
})
