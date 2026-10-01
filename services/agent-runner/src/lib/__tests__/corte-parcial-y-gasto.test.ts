/**
 * UNA CORRIDA CORTADA ENTREGA SU TEXTO COMO PARCIAL Y REGISTRA LO GASTADO · pruebas a costo cero · CC#1 · 2026-10-01 (encargo de Emilio · corrida 160410 del flujo de prueba).
 *
 * 🔴 El hecho medido: 4 llamadas con tope de US$ 0,12 · las 4 terminaron en `error_max_budget_usd` · las 4 quedaron en `agent_invocations` con cost_usd 0, 0 fichas y el mensaje «gastado ≈ US$ 0.0000»
 * (el SDK entrega el `result` del corte con `usage` en cero; su medidor propio —`total_cost_usd` y `modelUsage`— sí traía lo gastado y el corredor no lo leía). Además el texto escrito hasta el corte
 * sólo sobrevivía en Braintrust: no viajaba en la vuelta, no quedaba en el libro (el resumen se corta en 2.000 caracteres) y Vercel devolvía sólo `{success:false, error}`.
 *
 * Lo que se demuestra:
 *   ① el gasto de un FALLO es el mayor entre las fichas del `usage` y el medidor del SDK · el registro dice de dónde salió
 *   ② el resultado de un fallo con tope es PARCIAL (`partial:true` + causa) y trae el texto y lo gastado de verdad
 *   ③ el libro de invocaciones guarda el texto parcial (hasta 100 mil caracteres) y no sólo 2.000
 *   ④ TODO es opt-in: un éxito se calcula como siempre aunque el SDK traiga un `total_cost_usd` distinto · sin tope no existe `partial`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let flujo: Array<Record<string, unknown>> = []
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () =>
    (async function* () {
      for (const m of flujo) {
        if (typeof m.__lanza === 'string') throw new Error(m.__lanza)
        yield m
      }
    })(),
}))

const escrituras: Array<{ tabla: string; op: string; contenido?: Record<string, unknown> }> = []
function cadena(tabla: string): any {
  const q: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'gte', 'order', 'limit', 'is', 'neq']) q[m] = () => q
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'campaign-brief-agent', identity_content: 'Eres el planificador.', model: 'claude-sonnet' } : null, error: null })
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

const { runAgentViaSDK, drainStream } = await import('../agent-sdk-runner')
const { sumarModelUsage, reconciliarGastoDeFallo, causaDelParcial, TEXTO_PARCIAL_MAX_CHARS } = await import('../tope-por-corrida')

const USO_EN_CERO = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const USO = { input_tokens: 4000, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const MODEL_USAGE = { 'claude-sonnet-4-6': { inputTokens: 5200, outputTokens: 1100, cacheReadInputTokens: 0, cacheCreationInputTokens: 300, webSearchRequests: 0, costUSD: 0.1234, contextWindow: 200000, maxOutputTokens: 32000 } }
const TEXTO = '## 1) TITULAR\n\n**Ceviche de Olón, directo a tu puerta**'
// 🔴 el caso REAL de la corrida 160410: corte por presupuesto, `usage` en cero, medidor del SDK con lo gastado
const CORTE_REAL = [
  { type: 'system', subtype: 'init', session_id: 's1' },
  { type: 'assistant', message: { content: [{ type: 'text', text: TEXTO }] } },
  { type: 'result', subtype: 'error_max_budget_usd', is_error: true, session_id: 's1', usage: USO_EN_CERO, total_cost_usd: 0.1234, modelUsage: MODEL_USAGE },
  { __lanza: 'Claude Code process exited with code 1' },
]
const OK = [
  { type: 'system', subtype: 'init', session_id: 's1' },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'listo' }] } },
  { type: 'result', subtype: 'success', session_id: 's1', usage: USO, total_cost_usd: 99, modelUsage: { m: { inputTokens: 1, outputTokens: 1, costUSD: 99 } } },
]
const corrida = (extra: Record<string, unknown> = {}) =>
  runAgentViaSDK({ agentName: 'campaign-brief-agent', task: 'trivial', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'brief', forceRestart: true, dryRun: false, ...extra } as never)
const turno = () => new Promise((r) => setTimeout(r, 20))
const fila = () => escrituras.find((e) => e.tabla === 'agent_invocations' && e.op === 'insert')?.contenido as Record<string, any> | undefined
const completados = () => escrituras.filter((e) => e.tabla === 'workflow_checkpoints' && JSON.stringify(e.contenido ?? {}).includes('"step_status":"completed"'))
const costoPorFichas = (f: { input: number; output: number; cacheRead: number; cacheCreate: number }) => f.input * 3e-6 + f.output * 15e-6 + f.cacheRead * 0.3e-6 + f.cacheCreate * 3.75e-6

beforeEach(() => { flujo = OK; escrituras.length = 0 })

describe('① funciones puras · el gasto de un fallo', () => {
  it('sumarModelUsage suma por modelo · null si no hay nada legible', () => {
    expect(sumarModelUsage(MODEL_USAGE)).toEqual({ inputTokens: 5200, outputTokens: 1100, cacheReadInputTokens: 0, cacheCreationInputTokens: 300, costUSD: 0.1234 })
    expect(sumarModelUsage({ a: { inputTokens: 1, costUSD: 0.5 }, b: { inputTokens: 2, costUSD: 0.25 } })).toMatchObject({ inputTokens: 3, costUSD: 0.75 })
    for (const nada of [null, undefined, 3, 'x', [], {}, { a: null }]) expect(sumarModelUsage(nada), JSON.stringify(nada)).toBeNull()
  })
  it('🔴 usage en cero + medidor del SDK ⇒ se registra el gasto del SDK (el caso 160410) y de dónde salió', () => {
    const g = reconciliarGastoDeFallo({ costoPorFichas, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, sdkTotalCostUsd: 0.1234, sdkModelUsage: MODEL_USAGE })
    expect(g.costUsd).toBeCloseTo(0.1234, 6)
    expect(g).toMatchObject({ inputTokens: 5200, outputTokens: 1100, cacheCreationInputTokens: 300, fuente: 'sdk_total_cost_usd' })
  })
  it('sólo `total_cost_usd` (sin modelUsage): el costo se registra, las fichas quedan en 0 (no se inventan)', () => {
    const g = reconciliarGastoDeFallo({ costoPorFichas, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, sdkTotalCostUsd: 0.12, sdkModelUsage: null })
    expect(g).toMatchObject({ costUsd: 0.12, inputTokens: 0, outputTokens: 0, fuente: 'sdk_total_cost_usd' })
  })
  it('el mayor manda: fichas > medidor ⇒ fichas · sin ninguna de las dos ⇒ 0 y fuente «fichas»', () => {
    const a = reconciliarGastoDeFallo({ costoPorFichas, inputTokens: 4000, outputTokens: 2000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, sdkTotalCostUsd: 0.001, sdkModelUsage: null })
    expect(a.fuente).toBe('fichas'); expect(a.costUsd).toBeCloseTo(4000 * 3e-6 + 2000 * 15e-6, 6)
    const b = reconciliarGastoDeFallo({ costoPorFichas, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, sdkTotalCostUsd: null, sdkModelUsage: undefined })
    expect(b).toMatchObject({ costUsd: 0, fuente: 'fichas' })
  })
  it('un medidor basura (NaN, negativo, texto) no cuenta', () => {
    for (const mala of [NaN, -3, Infinity, '0.5' as unknown as number]) {
      expect(reconciliarGastoDeFallo({ costoPorFichas, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, sdkTotalCostUsd: mala, sdkModelUsage: null }).costUsd, String(mala)).toBe(0)
    }
  })
  it('causaDelParcial: el subtype del SDK o «error_del_sdk»', () => {
    expect(causaDelParcial('error_max_budget_usd')).toBe('error_max_budget_usd')
    expect(causaDelParcial(null)).toBe('error_del_sdk'); expect(causaDelParcial('')).toBe('error_del_sdk'); expect(causaDelParcial(undefined)).toBe('error_del_sdk')
  })
  it('drainStream captura el medidor del SDK (total_cost_usd y modelUsage)', async () => {
    const s = (m: Array<Record<string, unknown>>) => (async function* () { for (const x of m) { if (typeof x.__lanza === 'string') throw new Error(x.__lanza); yield x } })() as never
    const d = await drainStream(s(CORTE_REAL), { toleraSalidaTrasCorte: true })
    expect(d.sdkTotalCostUsd).toBe(0.1234)
    expect(d.sdkModelUsage).toEqual(MODEL_USAGE)
    expect((await drainStream(s([{ type: 'result', subtype: 'success', usage: USO }]))).sdkTotalCostUsd).toBeNull()
  })
})

describe('②③ la corrida completa: un corte por tope · SDK simulado con el resultado REAL de 160410', () => {
  it('🔴 el resultado es PARCIAL, trae el texto y lo gastado de verdad · antes: «gastado ≈ US$ 0.0000»', async () => {
    flujo = CORTE_REAL
    const r = await corrida({ maxBudgetUsd: 0.12 })
    expect(r.success).toBe(false)
    expect(r.partial).toBe(true)
    expect(r.partialReason).toBe('error_max_budget_usd')
    expect(r.response).toBe(TEXTO)
    expect(r.costUsd).toBeCloseTo(0.1234, 6)
    expect(r.inputTokens).toBe(5200); expect(r.outputTokens).toBe(1100)
    expect(r.error).toMatch(/gastado ≈ US\$ 0\.1234/)
    expect(r.error).toMatch(/PARCIAL/)
    await turno()
    expect(completados()).toHaveLength(0) // un parcial NUNCA se cachea como completado
  })
  it('🔴 el libro de invocaciones: costo y fichas REALES, estado failed, y el texto parcial completo con su causa y la fuente del gasto', async () => {
    flujo = CORTE_REAL
    await corrida({ maxBudgetUsd: 0.12 })
    await turno()
    const f = fila()!
    expect(f).toMatchObject({ status: 'failed', exit_code: 1, tokens_input: 5200, tokens_output: 1100 })
    expect(Number(f.cost_usd)).toBeCloseTo(0.1234, 6)
    expect(f.metadata).toMatchObject({ partial: true, partial_reason: 'error_max_budget_usd', partial_output: TEXTO, partial_output_truncated: false, cost_source: 'sdk_total_cost_usd', sdk_total_cost_usd: 0.1234 })
  })
  it('el texto parcial se conserva hasta 100 mil caracteres (el resumen de siempre se corta en 2.000) y se declara si se recortó', async () => {
    const largo = 'x'.repeat(TEXTO_PARCIAL_MAX_CHARS + 500)
    flujo = [CORTE_REAL[0], { type: 'assistant', message: { content: [{ type: 'text', text: largo }] } }, CORTE_REAL[2], CORTE_REAL[3]]
    const r = await corrida({ maxBudgetUsd: 0.12 })
    expect(r.response.length).toBe(largo.length) // el resultado trae TODO el texto
    await turno()
    const m = fila()!.metadata
    expect(m.partial_output.length).toBe(TEXTO_PARCIAL_MAX_CHARS)
    expect(m.partial_output_truncated).toBe(true)
    expect(String(fila()!.output_summary).length).toBeLessThanOrEqual(2001)
  })
  it('sin texto (la 3.ª llamada de 160410 tardó 7 min y no escribió nada): parcial con texto vacío y el gasto igual se registra', async () => {
    flujo = [CORTE_REAL[0], CORTE_REAL[2], CORTE_REAL[3]]
    const r = await corrida({ maxBudgetUsd: 0.12 })
    expect(r).toMatchObject({ success: false, partial: true, response: '' })
    expect(r.costUsd).toBeCloseTo(0.1234, 6)
  })
  it('otro fallo del resultado con tope (el máximo de 32.000) también registra el gasto del SDK y queda parcial', async () => {
    flujo = [CORTE_REAL[0], CORTE_REAL[1], { type: 'result', subtype: 'success', is_error: true, result: "API Error: Claude's response exceeded the 32000 output token maximum", session_id: 's1', usage: USO_EN_CERO, total_cost_usd: 2.4, modelUsage: {} }, CORTE_REAL[3]]
    const r = await corrida({ maxBudgetUsd: 3 })
    expect(r).toMatchObject({ success: false, partial: true, partialReason: 'success' })
    expect(r.costUsd).toBeCloseTo(2.4, 6)
    await turno()
    expect(Number(fila()!.cost_usd)).toBeCloseTo(2.4, 6)
  })
})

describe('④ opt-in puro · nada cambia fuera de un fallo con tope', () => {
  it('🔴 un ÉXITO se calcula por fichas aunque el SDK traiga otro `total_cost_usd` · sin partial ni claves nuevas en el libro', async () => {
    flujo = OK
    const r = await corrida({ maxBudgetUsd: 3 })
    expect(r.success).toBe(true)
    expect(r.partial).toBeUndefined(); expect(r.partialReason).toBeUndefined()
    expect(r.costUsd).toBeLessThan(1) // 4000 + 2000 fichas, no los 99 del medidor
    await turno()
    const m = fila()!.metadata
    for (const k of ['partial', 'partial_reason', 'partial_output', 'cost_source', 'sdk_total_cost_usd']) expect(Object.prototype.hasOwnProperty.call(m, k), k).toBe(false)
    expect(fila()).toMatchObject({ status: 'completed', exit_code: 0 })
  })
  it('SIN tope: el mismo corte no es un fallo (como hoy) ⇒ éxito, sin partial', async () => {
    flujo = [CORTE_REAL[0], CORTE_REAL[1], CORTE_REAL[2]]
    const r = await corrida({})
    expect(r.success).toBe(true)
    expect(r.partial).toBeUndefined()
  })
})
