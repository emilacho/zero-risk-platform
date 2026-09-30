/**
 * TOPE DURO DE GASTO POR CORRIDA · pruebas a costo cero · CC#1 · 2026-09-30 · pedido de Emilio (corrida real del brief · US$ 3,50).
 *
 * 🔴 Lo que se demuestra, no se describe:
 *   ① el pedido con tope llega al SDK como `maxBudgetUsd`, y SIN tope las opciones son las de siempre (ni la clave existe)
 *   ② un corte del SDK por presupuesto es un FALLO declarado (`success:false` + `error_max_budget_usd`) con lo gastado y el texto parcial, NUNCA un éxito · y NO se guarda como punto de control
 *   ③ un tope MAL ESCRITO se rechaza (no se ignora: la corrida pagaría sin tope)
 *   ④ sin tope, el comportamiento es idéntico al de hoy aunque el SDK dijera `error_max_budget_usd` (opt-in puro)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── un SDK falso: captura las opciones y devuelve el flujo que cada prueba arme ─────────────────────────────────────────────────────
let opcionesRecibidas: Record<string, unknown> | null = null
let flujo: Array<Record<string, unknown>> = []
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (p: { options: Record<string, unknown> }) => {
    opcionesRecibidas = p.options
    return (async function* () {
      for (const m of flujo) {
        if (typeof m.__lanza === 'string') throw new Error(m.__lanza)
        yield m
      }
    })()
  },
}))

// ── un Supabase de juguete: el agente existe, sin habilidades, sin puntos de control · anota lo que se escribe ───────────────────────
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
const { resolverTopeUsd, opcionDeTope, cortadoPorTope, mensajeDeCorte, TOPE_MAX_USD } = await import('../tope-por-corrida')

const USO = { input_tokens: 4000, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const CORTE = [
  { type: 'system', subtype: 'init', session_id: 's1' },
  { type: 'assistant', message: { content: [{ type: 'text', text: '{"parte":{"entregables":[{"id":"BRF-0001"' }] } },
  { type: 'result', subtype: 'error_max_budget_usd', session_id: 's1', usage: USO },
]
// 🔴 el caso REAL (corrida 158667): el SDK entrega el `result` de corte y DESPUÉS lanza la excepción de salida del proceso
const CORTE_Y_SALIDA = [...CORTE, { __lanza: 'Claude Code process exited with code 1' }]
const OK = [
  { type: 'system', subtype: 'init', session_id: 's1' },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'listo' }] } },
  { type: 'result', subtype: 'success', session_id: 's1', usage: USO },
]
const corrida = (extra: Record<string, unknown> = {}) =>
  runAgentViaSDK({ agentName: 'campaign-brief-agent', task: 'trivial', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'brief', forceRestart: true, dryRun: false, ...extra } as never)

// el punto de control se guarda «sin esperar» (void): se deja pasar un turno antes de mirar
const turno = () => new Promise((r) => setTimeout(r, 20))
const completados = () => escrituras.filter((e) => e.tabla === 'workflow_checkpoints' && JSON.stringify(e.contenido ?? {}).includes('"step_status":"completed"'))

beforeEach(() => { opcionesRecibidas = null; flujo = OK; escrituras.length = 0 })

describe('② el módulo del tope', () => {
  it('resolverTopeUsd: ausente ⇒ sin tope · presente y válido ⇒ el valor · cadena numérica ⇒ número', () => {
    expect(resolverTopeUsd(undefined, undefined)).toEqual({ ok: true, valor: null })
    expect(resolverTopeUsd(undefined, 3.5)).toEqual({ ok: true, valor: 3.5 })
    expect(resolverTopeUsd('3', undefined)).toEqual({ ok: true, valor: 3 })
    expect(resolverTopeUsd(TOPE_MAX_USD)).toEqual({ ok: true, valor: TOPE_MAX_USD })
  })
  it.each([[0], [-1], ['abc'], [''], [null], [NaN], [Infinity], [TOPE_MAX_USD + 1], [{}], [true]])(
    '🔴 un tope mal escrito (%j) se RECHAZA · ignorarlo dejaría pagar sin tope',
    (v) => { expect(resolverTopeUsd(v).ok).toBe(false) },
  )
  it('opcionDeTope: vacía sin tope · {maxBudgetUsd} con tope válido', () => {
    expect(opcionDeTope(undefined)).toEqual({})
    expect(opcionDeTope(null)).toEqual({})
    expect(opcionDeTope(0)).toEqual({})
    expect(opcionDeTope(3)).toEqual({ maxBudgetUsd: 3 })
  })
  it('cortadoPorTope: sólo si el pedido llevaba tope Y el SDK terminó con error_max_budget_usd', () => {
    expect(cortadoPorTope(3, 'error_max_budget_usd')).toBe(true)
    expect(cortadoPorTope(undefined, 'error_max_budget_usd')).toBe(false)
    expect(cortadoPorTope(3, 'success')).toBe(false)
    expect(cortadoPorTope(3, null)).toBe(false)
  })
  it('el mensaje dice el tope, lo gastado y que lo escrito es PARCIAL', () => {
    const m = mensajeDeCorte(3, 2.9876)
    expect(m).toMatch(/error_max_budget_usd/); expect(m).toMatch(/US\$ 3\)/); expect(m).toMatch(/2\.9876/); expect(m).toMatch(/PARCIAL/)
  })
})

describe('drainStream captura cómo terminó el SDK', () => {
  it('guarda el subtype del mensaje result (null si no llegó)', async () => {
    const stream = (msgs: Array<Record<string, unknown>>) => (async function* () { for (const m of msgs) yield m })() as never
    expect((await drainStream(stream(CORTE))).resultSubtype).toBe('error_max_budget_usd')
    expect((await drainStream(stream(OK))).resultSubtype).toBe('success')
    expect((await drainStream(stream([OK[0], OK[1]]))).resultSubtype).toBeNull()
  })
})

describe('🔴 la excepción de salida del SDK DESPUÉS del corte (el caso real 158667)', () => {
  const stream = (msgs: Array<Record<string, unknown>>) => (async function* () { for (const m of msgs) { if (typeof m.__lanza === 'string') throw new Error(m.__lanza); yield m } })() as never
  it('drainStream: el corte por presupuesto seguido de la excepción de salida se devuelve como corte (no se pierde el resultado)', async () => {
    const d = await drainStream(stream(CORTE_Y_SALIDA), { toleraSalidaTrasCorte: true })
    expect(d.resultSubtype).toBe('error_max_budget_usd')
    expect(d.responseText).toContain('BRF-0001')
    expect(d.inputTokens).toBe(4000)
  })
  it('drainStream: la MISMA excepción tras un resultado que NO es corte, o sin resultado, sigue subiendo (no se traga cualquier error)', async () => {
    const tolera = { toleraSalidaTrasCorte: true }
    await expect(drainStream(stream([...OK, { __lanza: 'Claude Code process exited with code 1' }]), tolera)).rejects.toThrow(/exited with code 1/)
    // y SIN la opción (llamador sin tope) la excepción sube AUNQUE el resultado fuera un corte: opt-in puro
    await expect(drainStream(stream(CORTE_Y_SALIDA))).rejects.toThrow(/exited with code 1/)
    await expect(drainStream(stream([OK[0], { __lanza: 'Claude Code process exited with code 1' }]), tolera)).rejects.toThrow(/exited with code 1/)
  })
  it('🔴 la corrida completa: corte + excepción de salida ⇒ FALLO declarado (error_max_budget_usd) con el gasto REGISTRADO en agent_invocations · antes: fail() sin gasto ni motivo', async () => {
    flujo = CORTE_Y_SALIDA
    const r = await corrida({ maxBudgetUsd: 3 })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/error_max_budget_usd/)
    expect(r.costUsd).toBeGreaterThan(0)
    await turno()
    expect(escrituras.some((e) => e.tabla === 'agent_invocations' && e.op === 'insert')).toBe(true) // el gasto queda en el libro: el freno diario lo ve
    expect(completados()).toHaveLength(0)
  })
  it('sin tope, la misma excepción de siempre es un fallo como hoy (opt-in puro)', async () => {
    flujo = CORTE_Y_SALIDA
    const r = await corrida({})
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/exited with code 1/)
  })
})

describe('①②④ la corrida completa del corredor (SDK simulado)', () => {
  it('🔴 con tope: el SDK recibe maxBudgetUsd · un corte por presupuesto es un FALLO declarado con lo gastado y el texto parcial · y NO se guarda punto de control', async () => {
    flujo = CORTE
    const r = await corrida({ maxBudgetUsd: 3 })
    expect(opcionesRecibidas).toMatchObject({ maxBudgetUsd: 3 })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/error_max_budget_usd/)
    expect(r.error).toMatch(/PARCIAL/)
    expect(r.response).toContain('BRF-0001') // el texto parcial queda a disposición del diagnóstico, pero NO como éxito
    expect(r.costUsd).toBeGreaterThan(0) // lo gastado se declara
    await turno()
    expect(completados()).toHaveLength(0) // el corte NO se cachea como «completado» (el punto de control «en curso» de antes de correr sí existe, y no se pisa)
  })
  it('con tope y una corrida NORMAL: éxito, el SDK recibió el tope, y el punto de control SÍ se guarda', async () => {
    flujo = OK
    const r = await corrida({ maxBudgetUsd: 3 })
    expect(opcionesRecibidas).toMatchObject({ maxBudgetUsd: 3 })
    expect(r.success).toBe(true)
    expect(r.error).toBeUndefined()
    await turno()
    expect(completados()).toHaveLength(1)
  })
  it('🔴 SIN tope: las opciones son las de siempre (ni existe la clave maxBudgetUsd) y aunque el SDK dijera error_max_budget_usd el resultado es el de hoy (opt-in puro)', async () => {
    flujo = CORTE
    const r = await corrida({})
    expect(opcionesRecibidas).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(opcionesRecibidas, 'maxBudgetUsd')).toBe(false)
    expect(r.success).toBe(true)
    expect(r.error).toBeUndefined()
  })
  it('un tope inválido que llegara hasta acá (0 / negativo) NO se pasa al SDK', async () => {
    await corrida({ maxBudgetUsd: 0 })
    expect(Object.prototype.hasOwnProperty.call(opcionesRecibidas, 'maxBudgetUsd')).toBe(false)
  })
})

// ── EL FALLO REAL (corrida 158667 · Braintrust): «response exceeded the 32000 output token maximum» · no es corte por tope ────────────────────
const { terminoConResultadoFallido, falloDelResultado, mensajeDeFalloDelSdk } = await import('../tope-por-corrida')
const CAUSA = "API Error: Claude's response exceeded the 32000 output token maximum"
const ERROR_DE_SALIDA = [
  { type: 'system', subtype: 'init', session_id: 's1' },
  { type: 'assistant', message: { content: [{ type: 'text', text: '{"parte":{"entregables":[{"id":"BRF-0001"' }] } },
  { type: 'result', subtype: 'success', is_error: true, result: CAUSA, session_id: 's1', usage: USO },
  { __lanza: 'Claude Code process exited with code 1' },
]
const escrituraDe = (tabla: string) => escrituras.find((e) => e.tabla === tabla && e.op === 'insert')?.contenido as Record<string, unknown> | undefined

describe('🔴 un error del resultado que NO es tope (el caso real): el gasto y la causa se registran', () => {
  it('funciones puras: sólo con tope opt-in · el corte por tope y error_max_turns no cuentan como «otro fallo»', () => {
    expect(terminoConResultadoFallido('success', true)).toBe(true)
    expect(terminoConResultadoFallido('success', false)).toBe(false)
    expect(terminoConResultadoFallido('error_max_turns', true)).toBe(false)
    expect(terminoConResultadoFallido('error_max_budget_usd', undefined)).toBe(true)
    expect(falloDelResultado(3, 'success', true, CAUSA)).toBe(CAUSA)
    expect(falloDelResultado(undefined, 'success', true, CAUSA)).toBeNull()
    expect(falloDelResultado(3, 'error_max_budget_usd', true, 'x')).toBeNull()
    expect(falloDelResultado(3, 'error_max_turns', true, 'x')).toBeNull()
    expect(falloDelResultado(3, 'success', true, null)).toMatch(/cerró con error/)
    expect(mensajeDeFalloDelSdk(CAUSA, 2.4)).toMatch(/FALLÓ .*32000.*2\.4000/)
  })
  it('drainStream captura is_error y la causa · con tolerancia devuelve el resultado · sin ella la excepción sube', async () => {
    const s = (m: Array<Record<string, unknown>>) => (async function* () { for (const x of m) { if (typeof x.__lanza === 'string') throw new Error(x.__lanza); yield x } })() as never
    const d = await drainStream(s(ERROR_DE_SALIDA), { toleraSalidaTrasCorte: true })
    expect(d).toMatchObject({ resultIsError: true, resultMessage: CAUSA, outputTokens: 2000 })
    await expect(drainStream(s(ERROR_DE_SALIDA))).rejects.toThrow(/exited with code 1/)
  })
  it('🔴 la corrida completa con tope: FALLO declarado con la causa y el gasto · fila de invocación failed/exit 1 · agents_log error · SIN punto de control', async () => {
    flujo = ERROR_DE_SALIDA
    const r = await corrida({ maxBudgetUsd: 3 })
    expect(r.success).toBe(false)
    expect(r.error).toContain(CAUSA)
    expect(r.costUsd).toBeGreaterThan(0)
    await turno()
    expect(escrituraDe('agent_invocations')).toMatchObject({ status: 'failed', exit_code: 1, error_message: expect.stringContaining('32000') })
    expect(Number(escrituraDe('agent_invocations')?.cost_usd)).toBeGreaterThan(0)
    expect(escrituraDe('agents_log')).toMatchObject({ status: 'error', error_message: expect.stringContaining('32000') })
    expect(completados()).toHaveLength(0)
  })
  it('el corte por tope también queda failed en el libro (antes quedaba completed con exit 0)', async () => {
    flujo = CORTE_Y_SALIDA
    await corrida({ maxBudgetUsd: 3 })
    await turno()
    expect(escrituraDe('agent_invocations')).toMatchObject({ status: 'failed', exit_code: 1, error_message: expect.stringMatching(/error_max_budget_usd/) })
  })
  it('una corrida sana sigue completed / exit 0 / sin error_message', async () => {
    flujo = OK
    await corrida({ maxBudgetUsd: 3 })
    await turno()
    expect(escrituraDe('agent_invocations')).toMatchObject({ status: 'completed', exit_code: 0, error_message: null })
    expect(escrituraDe('agents_log')).toMatchObject({ status: 'success' })
  })
  it('SIN tope: el error del resultado con excepción sigue subiendo como siempre (opt-in puro)', async () => {
    flujo = ERROR_DE_SALIDA
    const r = await corrida({})
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/exited with code 1/)
  })
})
