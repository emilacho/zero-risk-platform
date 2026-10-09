/**
 * TOPE SALTADO AL CERRAR · pruebas a costo cero · CC#1 · relevo 29 (corrida real 170711: Fable 5.1, calendario de 12 semanas · tope US$ 2,50 · «error_max_budget_usd» con la respuesta final ya escrita y perdida).
 *
 * 🔴 Lo que se demuestra, no se describe:
 *   ① el cierre se reconoce SOLO si lo último escrito es texto (ninguna herramienta pendiente) Y el SDK dijo `stop_reason: end_turn` en el `result`
 *   ② un corte por presupuesto con cierre completo GUARDA la respuesta final y la marca (`cerradaPorTope` / metadata `cerrada_por_tope`) · el libro queda `completed`
 *   ③ un corte a mitad del trabajo (última acción = herramienta) o con parada distinta de `end_turn` sigue siendo FALLO con texto parcial, como siempre
 *   ④ `output_summary` guarda el texto FINAL, no la narración del principio
 *   ⑤ sin tope (opt-in) nada cambia: un corte sin `max_budget_usd` no se interpreta como cierre
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

const { runAgentViaSDK, drainStream } = await import('../agent-sdk-runner')
const { cerradaPorTope, mensajeDeCierreConTope } = await import('../tope-por-corrida')

const USO = { input_tokens: 4000, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const INIT = { type: 'system', subtype: 'init', session_id: 's1' }
const texto = (t: string) => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } })
const herramienta = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__x__buscar', input: { q: 'a' } }] } }
const resultadoHerramienta = { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }
const resultado = (subtype: string, stop_reason: string | null) => ({ type: 'result', subtype, stop_reason, session_id: 's1', usage: USO })
const stream = (msgs: Array<Record<string, unknown>>) => (async function* () { for (const m of msgs) yield m })() as never

const NARRACION = 'Voy a buscar datos primero.'
const FINAL = '# Calendario\n\nSemana 1 · lunes 12 de octubre · 19:00 · Instagram · reel · pilar producto.'
const CIERRE_CORTADO = [INIT, texto(NARRACION), herramienta, resultadoHerramienta, texto(FINAL), resultado('error_max_budget_usd', 'end_turn')]
const CORTE_A_MEDIAS = [INIT, texto(NARRACION), herramienta, resultado('error_max_budget_usd', 'tool_use')]

const corrida = (extra: Record<string, unknown> = {}) =>
  runAgentViaSDK({ agentName: 'social-media-strategist', task: 'trivial', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'estrategia', forceRestart: true, dryRun: false, ...extra } as never)
const turno = () => new Promise((r) => setTimeout(r, 20))
const filaDelLibro = () => escrituras.find((e) => e.tabla === 'agent_invocations' && e.op === 'insert')?.contenido as Record<string, any>
const completados = () => escrituras.filter((e) => e.tabla === 'workflow_checkpoints' && JSON.stringify(e.contenido ?? {}).includes('"step_status":"completed"'))

beforeEach(() => { flujo = CIERRE_CORTADO; escrituras.length = 0 })

describe('① drainStream reconoce el cierre', () => {
  it('texto de cierre tras la última herramienta + end_turn ⇒ cierre completo · textoFinal SIN la narración · responseText sigue entero', async () => {
    const d = await drainStream(stream(CIERRE_CORTADO))
    expect(d.cierreConTexto).toBe(true)
    expect(d.textoFinal).toBe(FINAL)
    expect(d.responseText).toBe(NARRACION + FINAL)
  })
  it('varios bloques de texto seguidos del cierre se juntan', async () => {
    const d = await drainStream(stream([INIT, texto('Parte A. '), texto('Parte B.'), resultado('error_max_budget_usd', 'end_turn')]))
    expect(d.textoFinal).toBe('Parte A. Parte B.')
    expect(d.cierreConTexto).toBe(true)
  })
  it('🔴 la última acción fue una herramienta ⇒ NO es cierre (el corte llegó a mitad del trabajo) y no hay texto final', async () => {
    const d = await drainStream(stream(CORTE_A_MEDIAS))
    expect(d.cierreConTexto).toBe(false)
    expect(d.textoFinal).toBe('')
  })
  it.each([['max_tokens'], ['tool_use'], ['refusal'], [null]])('🔴 texto al final pero el SDK paró por %j ⇒ NO es cierre completo (podría estar cortado a media frase)', async (parada) => {
    const d = await drainStream(stream([INIT, texto(FINAL), resultado('error_max_budget_usd', parada)]))
    expect(d.cierreConTexto).toBe(false)
  })
  it('🔴 un mensaje de usuario (resultado de herramienta) después del texto lo deja de ser cierre: lo escrito ANTES ya no es el último turno', async () => {
    const d = await drainStream(stream([INIT, texto(NARRACION), resultadoHerramienta, resultado('error_max_budget_usd', 'end_turn')]))
    expect(d.textoFinal).toBe('')
    expect(d.cierreConTexto).toBe(false)
  })
  it('sin mensaje result (la corriente se cortó) ⇒ no es cierre', async () => {
    expect((await drainStream(stream([INIT, texto(FINAL)]))).cierreConTexto).toBe(false)
  })
  it('texto en blanco no cuenta como cierre', async () => {
    expect((await drainStream(stream([INIT, texto('  \n'), resultado('error_max_budget_usd', 'end_turn')]))).cierreConTexto).toBe(false)
  })
})

describe('② cerradaPorTope · tabla de verdad', () => {
  it('solo con tope + corte por presupuesto + cierre completo + texto', () => {
    expect(cerradaPorTope(2.5, 'error_max_budget_usd', true, FINAL)).toBe(true)
    expect(cerradaPorTope(undefined, 'error_max_budget_usd', true, FINAL)).toBe(false) // sin tope: opt-in puro
    expect(cerradaPorTope(2.5, 'success', true, FINAL)).toBe(false)
    expect(cerradaPorTope(2.5, 'error_max_budget_usd', false, FINAL)).toBe(false)
    expect(cerradaPorTope(2.5, 'error_max_budget_usd', undefined, FINAL)).toBe(false)
    expect(cerradaPorTope(2.5, 'error_max_budget_usd', true, '')).toBe(false)
    expect(cerradaPorTope(2.5, 'error_max_budget_usd', true, undefined)).toBe(false)
  })
  it('el mensaje dice el tope, lo gastado y que la respuesta estaba COMPLETA y se guardó', () => {
    const m = mensajeDeCierreConTope(2.5, 2.2332)
    expect(m).toMatch(/error_max_budget_usd/); expect(m).toMatch(/US\$ 2\.5\)/); expect(m).toMatch(/2\.2332/); expect(m).toMatch(/COMPLETA/)
  })
})

describe('③ la corrida completa del corredor (SDK simulado)', () => {
  it('🔴 tope saltado AL CERRAR ⇒ la respuesta final se ENTREGA y se marca · el libro queda completed con cerrada_por_tope · antes: fallo y texto perdido', async () => {
    const r = await corrida({ maxBudgetUsd: 2.5 })
    expect(r.success).toBe(true)
    expect(r.error).toBeUndefined()
    expect(r.cerradaPorTope).toBe(true)
    expect(r.response).toBe(FINAL)
    expect(r.costUsd).toBeGreaterThan(0)
    await turno()
    const fila = filaDelLibro()
    expect(fila.status).toBe('completed')
    expect(fila.error_message).toBeNull()
    expect(fila.metadata.cerrada_por_tope).toBe(true)
    expect(fila.metadata.cerrada_por_tope_detalle).toMatch(/AL CERRAR/)
    expect(fila.output_summary).toBe(FINAL)
    expect(completados()).toHaveLength(1) // la respuesta es real y completa: queda como punto de control
  })
  it('🔴 corte a MITAD del trabajo ⇒ sigue siendo FALLO declarado con texto parcial (nada cambia) · sin marca · sin punto de control', async () => {
    flujo = CORTE_A_MEDIAS
    const r = await corrida({ maxBudgetUsd: 2.5 })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/error_max_budget_usd/)
    expect(r.error).toMatch(/PARCIAL/)
    expect(r.cerradaPorTope).toBeUndefined()
    await turno()
    const fila = filaDelLibro()
    expect(fila.status).toBe('failed')
    expect(fila.metadata.cerrada_por_tope).toBeUndefined()
    expect(completados()).toHaveLength(0)
  })
  it('🔴 texto al final pero el SDK paró por max_tokens ⇒ FALLO (no se da por completa una respuesta posiblemente cortada)', async () => {
    flujo = [INIT, texto(FINAL), resultado('error_max_budget_usd', 'max_tokens')]
    const r = await corrida({ maxBudgetUsd: 2.5 })
    expect(r.success).toBe(false)
    expect(r.cerradaPorTope).toBeUndefined()
  })
  it('sin tope en el pedido el mismo flujo NO se toca (opt-in puro): ni marca ni cambio de respuesta', async () => {
    const r = await corrida({})
    expect(r.cerradaPorTope).toBeUndefined()
    expect(r.response).toBe(NARRACION + FINAL) // la respuesta de siempre: todo el texto
  })
  it('el corte con cierre y la excepción de salida del proceso (el caso real) también guarda la respuesta', async () => {
    flujo = [...CIERRE_CORTADO, { __lanza: 'Claude Code process exited with code 1' }]
    const r = await corrida({ maxBudgetUsd: 2.5 })
    expect(r.success).toBe(true)
    expect(r.cerradaPorTope).toBe(true)
    expect(r.response).toBe(FINAL)
  })
})

describe('④ output_summary guarda el texto FINAL', () => {
  it('corrida normal con narración + herramienta + cierre ⇒ el resumen es el cierre, no «Voy a buscar…»', async () => {
    flujo = [INIT, texto(NARRACION), herramienta, resultadoHerramienta, texto(FINAL), resultado('success', 'end_turn')]
    const r = await corrida({})
    expect(r.success).toBe(true)
    await turno()
    expect(filaDelLibro().output_summary).toBe(FINAL)
    expect(filaDelLibro().output_summary).not.toContain('Voy a buscar')
  })
  it('un cierre de más de 2000 caracteres se recorta a 2000 + «…» (como siempre)', async () => {
    flujo = [INIT, texto(NARRACION), herramienta, resultadoHerramienta, texto('x'.repeat(2500)), resultado('success', 'end_turn')]
    await corrida({})
    await turno()
    expect(filaDelLibro().output_summary).toBe('x'.repeat(2000) + '…')
  })
  it('sin herramientas (solo texto) el resumen es el texto entero, igual que antes', async () => {
    flujo = [INIT, texto('listo'), resultado('success', 'end_turn')]
    await corrida({})
    await turno()
    expect(filaDelLibro().output_summary).toBe('listo')
  })
  it('si el último paso fue una herramienta (sin cierre) el resumen cae al texto entero · no queda vacío', async () => {
    flujo = CORTE_A_MEDIAS
    await corrida({ maxBudgetUsd: 2.5 })
    await turno()
    expect(filaDelLibro().output_summary).toBe(NARRACION)
  })
})
