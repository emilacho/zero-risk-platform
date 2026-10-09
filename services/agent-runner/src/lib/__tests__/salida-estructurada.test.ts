/**
 * SALIDA ESTRUCTURADA POR CORRIDA · pruebas a costo cero · CC#1 · cadena PR 3.
 *
 * 🔴 Lo que se demuestra:
 *   ① un esquema mal escrito se RECHAZA antes de gastar (clave no permitida, objeto sin additionalProperties:false, raíz que no es objeto, muy grande, muy hondo, `null`, texto no JSON)
 *   ② ausente ⇒ el camino de siempre: ni `outputFormat` en las opciones del SDK, ni campos nuevos en el resultado ni en el libro
 *   ③ con esquema: se pasa a `query()` como `outputFormat: json_schema` y el objeto vuelve en `structuredOutput`
 *   ④ reintentos agotados del SDK o ausencia del objeto ⇒ FALLO declarado (el texto libre no se da por respuesta)
 *   ⑤ un tope saltado al cerrar con esquema solo vale si el OBJETO llegó
 *   ⑥ la copia de la ruta `run-sdk` es idéntica a la del corredor
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let flujo: Array<Record<string, unknown>> = []
let opcionesVistas: Record<string, any> | null = null
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (arg: { options: Record<string, any> }) => {
    opcionesVistas = arg.options
    return (async function* () { for (const m of flujo) yield m })()
  },
}))

const escrituras: Array<{ tabla: string; op: string; contenido?: Record<string, unknown> }> = []
function cadena(tabla: string): any {
  const q: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'gte', 'order', 'limit', 'is', 'neq']) q[m] = () => q
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'social-media-strategist', identity_content: 'Eres el estratega.', model: 'claude-sonnet' } : null, error: null })
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

const { runAgentViaSDK } = await import('../agent-sdk-runner')
const { validarEsquemaDeSalida, resolverEsquema, falloDeSalidaEstructurada, hashDeEsquema, ESQUEMA_MAX_BYTES } = await import('../salida-estructurada')
const { cuerpoDeLaVuelta } = await import('../entrega-de-la-vuelta')

const ESQUEMA = {
  type: 'object', additionalProperties: false, required: ['titulo', 'piezas'],
  properties: {
    titulo: { type: 'string' },
    piezas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['dia', 'red'], properties: { dia: { type: 'integer' }, red: { enum: ['instagram', 'facebook'] }, nota: { anyOf: [{ type: 'string' }, { type: 'null' }] } } } },
  },
}
const OBJETO = { titulo: 'Semana 1', piezas: [{ dia: 1, red: 'instagram', nota: null }] }

describe('① un esquema mal escrito se rechaza ANTES de gastar', () => {
  it('uno bueno pasa y trae un sello estable (las claves en otro orden dan el mismo sello)', () => {
    const r = validarEsquemaDeSalida(ESQUEMA)
    expect(r.ok).toBe(true)
    const otro = { properties: ESQUEMA.properties, required: ESQUEMA.required, additionalProperties: false, type: 'object' }
    expect(hashDeEsquema(otro as never)).toBe(hashDeEsquema(ESQUEMA as never))
    expect(hashDeEsquema({ ...ESQUEMA, required: ['titulo'] } as never)).not.toBe(hashDeEsquema(ESQUEMA as never))
  })
  it.each([
    ['minLength', { type: 'object', additionalProperties: false, properties: { a: { type: 'string', minLength: 3 } } }],
    ['pattern', { type: 'object', additionalProperties: false, properties: { a: { type: 'string', pattern: '^a' } } }],
    ['format', { type: 'object', additionalProperties: false, properties: { a: { type: 'string', format: 'date' } } }],
    ['maximum', { type: 'object', additionalProperties: false, properties: { a: { type: 'integer', maximum: 3 } } }],
    ['$ref', { type: 'object', additionalProperties: false, properties: { a: { $ref: '#/x' } } }],
  ])('la clave «%s» se rechaza (el modo estructurado no la garantiza: se valida en el código)', (_n, e) => {
    const r = validarEsquemaDeSalida(e)
    expect(r.ok).toBe(false)
  })
  it('un objeto sin additionalProperties:false, la raíz que no es objeto, tipos desconocidos y required fantasma se rechazan', () => {
    expect(validarEsquemaDeSalida({ type: 'object', properties: {} }).ok).toBe(false)
    expect(validarEsquemaDeSalida({ type: 'array', items: { type: 'string' } }).ok).toBe(false)
    expect(validarEsquemaDeSalida({ type: 'object', additionalProperties: false, properties: { a: { type: 'fecha' } } }).ok).toBe(false)
    expect(validarEsquemaDeSalida({ type: 'object', additionalProperties: false, required: ['x'], properties: {} }).ok).toBe(false)
    expect(validarEsquemaDeSalida({ type: 'object', additionalProperties: false, properties: { a: { type: 'array' } } }).ok).toBe(false)
    expect(validarEsquemaDeSalida({ type: 'object', additionalProperties: false, properties: { a: { type: 'string', properties: {} } } }).ok).toBe(false)
    expect(validarEsquemaDeSalida({ type: 'object', additionalProperties: false, properties: { a: { enum: [] } } }).ok).toBe(false)
  })
  it('demasiado grande o demasiado hondo se rechaza', () => {
    const grande = { type: 'object', additionalProperties: false, properties: Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`campo_numero_${i}`, { type: 'string', description: 'x'.repeat(20) }])) }
    expect(JSON.stringify(grande).length).toBeGreaterThan(ESQUEMA_MAX_BYTES)
    expect(validarEsquemaDeSalida(grande).ok).toBe(false)
    let hondo: Record<string, unknown> = { type: 'string' }
    for (let i = 0; i < 9; i++) hondo = { type: 'object', additionalProperties: false, properties: { a: hondo } }
    expect(validarEsquemaDeSalida(hondo).ok).toBe(false)
  })
  it('resolver: ausente ⇒ null; `null` explícito se rechaza; un texto JSON se lee; un texto roto se rechaza; manda el primero presente', () => {
    expect(resolverEsquema(undefined, undefined)).toEqual({ ok: true, valor: null, hash: null })
    expect(resolverEsquema(null).ok).toBe(false)
    expect(resolverEsquema(JSON.stringify(ESQUEMA)).ok).toBe(true)
    expect(resolverEsquema('{no es json').ok).toBe(false)
    expect(resolverEsquema(undefined, ESQUEMA, { type: 'x' }).ok).toBe(true)
    expect(resolverEsquema({ type: 'x' }, ESQUEMA).ok).toBe(false)
  })
})

describe('② ausente ⇒ el camino de siempre', () => {
  const corrida = (extra: Record<string, unknown> = {}) =>
    runAgentViaSDK({ agentName: 'social-media-strategist', task: 'trivial', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'estrategia', forceRestart: true, dryRun: false, ...extra } as never)
  const USO = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  const INIT = { type: 'system', subtype: 'init', session_id: 's1' }
  const texto = (t: string) => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } })
  const resultado = (extra: Record<string, unknown> = {}) => ({ type: 'result', subtype: 'success', stop_reason: 'end_turn', session_id: 's1', usage: USO, ...extra })
  const filaDelLibro = () => escrituras.find((e) => e.tabla === 'agent_invocations' && e.op === 'insert')?.contenido as Record<string, any>
  const turno = () => new Promise((r) => setTimeout(r, 20))
  beforeEach(() => { escrituras.length = 0; opcionesVistas = null })

  it('sin esquema: no hay `outputFormat`, ni campos nuevos en el resultado ni en el libro', async () => {
    flujo = [INIT, texto('hola'), resultado()]
    const r = await corrida()
    await turno()
    expect(opcionesVistas).not.toBeNull()
    expect('outputFormat' in (opcionesVistas as object)).toBe(false)
    expect(r.success).toBe(true)
    expect('structuredOutput' in r).toBe(false)
    expect('structuredOutputValid' in r).toBe(false)
    expect(JSON.stringify(filaDelLibro())).not.toMatch(/output_schema_hash|structured_output_received/)
  })

  it('③ con esquema: se pasa a query() como json_schema y el objeto vuelve en structuredOutput · el libro guarda el sello del esquema', async () => {
    flujo = [INIT, texto('listo'), resultado({ structured_output: OBJETO })]
    const r = await corrida({ outputSchema: ESQUEMA })
    await turno()
    expect(opcionesVistas!.outputFormat).toEqual({ type: 'json_schema', schema: ESQUEMA })
    expect(r.success).toBe(true)
    expect(r.structuredOutput).toEqual(OBJETO)
    expect(r.structuredOutputValid).toBe(true)
    const meta = filaDelLibro().metadata
    expect(meta.output_schema_hash).toBe(hashDeEsquema(ESQUEMA as never))
    expect(meta.structured_output_received).toBe(true)
  })

  it('④ 🔴 reintentos agotados del SDK ⇒ FALLO declarado con su código; el texto libre no se da por respuesta', async () => {
    flujo = [INIT, texto('{"titulo": "roto"'), resultado({ subtype: 'error_max_structured_output_retries', is_error: true })]
    const r = await corrida({ outputSchema: ESQUEMA })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/E-OUTPUT-SCHEMA-RETRIES/)
    expect('structuredOutput' in r).toBe(false)
    expect(r.structuredOutputValid).toBe(false)
  })
  it('④ 🔴 la corrida termina bien pero sin objeto ⇒ FALLO (E-OUTPUT-SCHEMA-MISSING)', async () => {
    flujo = [INIT, texto('{"titulo":"x"}'), resultado()]
    const r = await corrida({ outputSchema: ESQUEMA })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/E-OUTPUT-SCHEMA-MISSING/)
  })

  it('⑤ 🔴 tope saltado al cerrar CON esquema: si el objeto llegó, se entrega marcado; si no llegó, es fallo (el texto no vale)', async () => {
    flujo = [INIT, texto('final'), resultado({ subtype: 'error_max_budget_usd', structured_output: OBJETO })]
    const ok = await corrida({ outputSchema: ESQUEMA, maxBudgetUsd: 2.5 })
    expect(ok.success).toBe(true)
    expect(ok.cerradaPorTope).toBe(true)
    expect(ok.structuredOutput).toEqual(OBJETO)
    flujo = [INIT, texto('final'), resultado({ subtype: 'error_max_budget_usd' })]
    const mal = await corrida({ outputSchema: ESQUEMA, maxBudgetUsd: 2.5 })
    expect(mal.success).toBe(false)
    expect('cerradaPorTope' in mal).toBe(false)
  })
})

describe('falloDeSalidaEstructurada · tabla de verdad', () => {
  it('sin esquema nunca es fallo; con esquema, solo el objeto presente lo evita', () => {
    expect(falloDeSalidaEstructurada(null, 'success', undefined)).toBeNull()
    expect(falloDeSalidaEstructurada(undefined, 'error_max_structured_output_retries', undefined)).toBeNull()
    expect(falloDeSalidaEstructurada(ESQUEMA, 'success', OBJETO)).toBeNull()
    expect(falloDeSalidaEstructurada(ESQUEMA, 'success', undefined)).toMatch(/MISSING/)
    expect(falloDeSalidaEstructurada(ESQUEMA, 'success', null)).toMatch(/MISSING/)
    expect(falloDeSalidaEstructurada(ESQUEMA, 'error_max_structured_output_retries', undefined)).toMatch(/RETRIES/)
  })
})

describe('la vuelta del corredor lleva el objeto (callback_mode: runner)', () => {
  const base = { success: true, response: 'x', sessionId: 's', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.1, durationMs: 5 }
  it('con objeto: structured_output y structured_output_valid viajan; sin él, la vuelta es la de siempre', () => {
    const con = cuerpoDeLaVuelta({ ...base, structuredOutput: OBJETO, structuredOutputValid: true }, { agentName: 'a', dispatchKey: 'k' })
    expect(con.structured_output).toEqual(OBJETO)
    expect(con.structured_output_valid).toBe(true)
    const sin = cuerpoDeLaVuelta(base, { agentName: 'a', dispatchKey: 'k' })
    expect('structured_output' in sin).toBe(false)
    expect('structured_output_valid' in sin).toBe(false)
  })
})

describe('⑥ la copia de la ruta es idéntica a la del corredor', () => {
  it('src/lib/salida-estructurada.ts == services/agent-runner/src/lib/salida-estructurada.ts', () => {
    const raiz = join(__dirname, '..', '..', '..', '..', '..')
    const a = readFileSync(join(raiz, 'src', 'lib', 'salida-estructurada.ts'), 'utf8').replace(/\r\n/g, '\n')
    const b = readFileSync(join(raiz, 'services', 'agent-runner', 'src', 'lib', 'salida-estructurada.ts'), 'utf8').replace(/\r\n/g, '\n')
    expect(a).toBe(b)
  })
})

describe('la ruta run-sdk valida el esquema ANTES de gastar y lo reenvía (comprobación estática: la ruta no se importa por sus dependencias)', () => {
  const raiz = join(__dirname, '..', '..', '..', '..', '..')
  const ruta = readFileSync(join(raiz, 'src', 'app', 'api', 'agents', 'run-sdk', 'route.ts'), 'utf8').replace(/\r\n/g, '\n')
  it('se valida antes de la guarda de gasto y devuelve 400 con su código', () => {
    const iValida = ruta.indexOf('resolverEsquema(')
    const iGuarda = ruta.indexOf('§150 spend gate')
    expect(iValida).toBeGreaterThan(0)
    expect(iGuarda).toBeGreaterThan(iValida)
    expect(ruta).toMatch(/if \(!esquemaDelPedido\.ok\) \{\s*return NextResponse\.json\([\s\S]{0,260}E-OUTPUT-SCHEMA-INVALID[\s\S]{0,200}status: 400/)
  })
  it('lo reenvía al corredor solo cuando vino, y devuelve el objeto y su validez en la respuesta', () => {
    expect(ruta).toMatch(/esquemaDelPedido\.valor !== null \? \{ output_schema: esquemaDelPedido\.valor \}/)
    expect(ruta).toMatch(/structured_output_valid: result\.structuredOutputValid/)
    expect(ruta).toMatch(/structured_output: result\.structuredOutput/)
  })
  it('el corredor valida antes de gastar y la vuelta por callback lleva el objeto', () => {
    const idx = readFileSync(join(raiz, 'services', 'agent-runner', 'src', 'index.ts'), 'utf8')
    expect(idx).toMatch(/E-OUTPUT-SCHEMA-INVALID/)
    expect(idx.indexOf('resolverEsquema(')).toBeLessThan(idx.indexOf('const input: AgentRunInput'))
  })
})
