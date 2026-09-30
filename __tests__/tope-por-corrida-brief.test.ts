/**
 * TOPE DURO POR CORRIDA · lado de Vercel y del flujo del brief · pruebas a costo cero · CC#1 · 2026-09-30 (pedido de Emilio · corrida real del brief · US$ 3,50).
 *
 * 🔴 Lo que se demuestra:
 *   · el sobre con `tope_usd` llega al nodo que paga como `max_budget_usd`, pasa por Vercel y llega al corredor · SIN tope todo es como hoy
 *   · un tope MAL ESCRITO detiene la corrida ANTES de gastar (en el sobre y en Vercel) · ignorarlo dejaría pagar sin tope
 *   · un FALLO del redactor (p. ej. el corte por tope) se lee como fallo con su motivo y lo gastado · el parte sale INVÁLIDO y la corrida no cierra en verde
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn(), setTag: vi.fn(), withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: vi.fn().mockResolvedValue({ blocked: false }) }))
const promesas: Promise<unknown>[] = []
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { promesas.push(p) } }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'insert', 'update', 'upsert']) q[m] = () => q; q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r); q.maybeSingle = async () => ({ data: null, error: null }); q.single = q.maybeSingle; return q } }),
}))
const registrar = vi.fn().mockResolvedValue({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', idempotent: false })
vi.mock('@/lib/agent-dispatch-ledger', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-dispatch-ledger')>()), recordDispatchIntent: (...a: unknown[]) => registrar(...a), markDispatchRunning: vi.fn().mockResolvedValue(undefined), markDispatchTerminal: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/agent-async-callback', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-async-callback')>()), dispatchAsyncCallback: vi.fn().mockResolvedValue({ ok: true, status: 'ok', status_code: 200, duration_ms: 1, attempts: 1 }) }))
import { POST } from '@/app/api/agents/run-sdk/route'
import { cuerpoDeLaVuelta } from '../services/agent-runner/src/lib/entrega-de-la-vuelta'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo')
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const { armarSimulacroSano } = require(join(DIR, 'simulacro-parte-sano.js'))
const { construirFlujo } = await import(pathToFileURL(join(DIR, 'construir-brief.mjs')).href)

type Ctx = { input?: unknown[]; refs?: Record<string, unknown>; env?: Record<string, string> }
async function correrNodo(archivo: string, ctx: Ctx, conChequeos = false) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => { if (!(ctx.refs && n in ctx.refs)) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: ctx.refs![n] }), all: () => [{ json: ctx.refs![n] }] } }
  let codigo = leer(archivo).replace('__REFERENCIA__', JSON.stringify(leer('referencia-el-brief-de-un-entregable.md')))
  if (conChequeos) { const c = leer('brief-chequeos.js'); const i = c.indexOf("if (typeof module !== 'undefined' && module.exports)"); codigo = (i === -1 ? c : c.slice(0, i)) + '\n' + codigo }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo)($input, $, ctx.env ?? {}, items[0]?.json, { id: 'WF-1' }, { id: '999', resumeUrl: 'https://n8n.test/webhook-waiting/999' })
}
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const LLAVE = 'llave-de-despacho-de-prueba-0123456789abcdef'
const sobre = (body: Record<string, unknown>) => correrNodo('n0-sobre.js', { input: [{ body: { client_id: CID, dry_run: false, ...body }, headers: { 'x-sala-dispatch-key': LLAVE } }], env: { SALA_DISPATCH_KEY: LLAVE } })
const PLAN = `# PLAN\n### Semana 1-2 · el camino de Instagram para el turno de la mañana\nAnuncio de imagen para mostrar el ceviche.`
const MANUAL = { forbidden_words: ['premium'], required_terminology: ['marisco de Olón'] }

describe('① el sobre valida `tope_usd` ANTES de gastar', () => {
  it('ausente ⇒ tope_usd:null (como hoy) · válido ⇒ el número · cadena numérica ⇒ número · también en modo seco', async () => {
    expect((await sobre({}))[0].json.tope_usd).toBeNull()
    expect((await sobre({ tope_usd: 3 }))[0].json.tope_usd).toBe(3)
    expect((await sobre({ tope_usd: '3.5' }))[0].json.tope_usd).toBe(3.5)
    expect((await sobre({ tope_usd: 3, dry_run: true }))[0].json.tope_usd).toBe(3)
  })
  it.each([[0], [-2], ['abc'], [''], [null], [51], [{}], [false]])('🔴 tope mal escrito (%j) ⇒ BRIEF_TOPE_INVALIDO · la corrida SE DETIENE antes de gastar', async (v) => {
    await expect(sobre({ tope_usd: v })).rejects.toThrow(/BRIEF_TOPE_INVALIDO/)
  })
})

describe('② el nodo que paga manda el tope al corredor', () => {
  const cuerpo = async (prev: Record<string, unknown>) => (await correrNodo('n3-armar-cuerpo.js', { input: [{ name: 'Náufrago' }], refs: { '② ¿Ya hay parte de este plan? · guarda': { client_id: CID, dry_run: false, manual_texto: 'm', plan_id: 'p', plan_texto: 'x', manual_version: 1, manual_id: 'm', ...prev } } }))[0].json.cuerpo
  it('con tope_usd ⇒ max_budget_usd en el cuerpo · sin tope ⇒ el cuerpo de siempre (ni la clave)', async () => {
    expect(await cuerpo({ tope_usd: 3 })).toMatchObject({ max_budget_usd: 3, agent: 'campaign-brief-agent', callback_mode: 'runner', dry_run: false })
    expect(Object.prototype.hasOwnProperty.call(await cuerpo({ tope_usd: null }), 'max_budget_usd')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(await cuerpo({}), 'max_budget_usd')).toBe(false)
  })
  it('el sobre → guardas → cuerpo lleva el tope de punta a punta (las guardas propagan el sobre)', async () => {
    const [{ json: s }] = await sobre({ tope_usd: 3 })
    expect(s.tope_usd).toBe(3)
    const [{ json: m }] = await correrNodo('n1-guarda-manual.js', { input: [{ id: 'm1', version: 1, gate_outcome: 'paso_la_vara', content_text: 'x', forbidden_words: [], required_terminology: [] }], refs: { '⓪ Sobre · llave · modo seco': s } })
    expect(m.tope_usd).toBe(3)
  })
})

describe('③ Vercel valida y reenvía `max_budget_usd`', () => {
  const N8N = 'https://n8n-production-72be.up.railway.app/webhook-waiting/900?signature=abc'
  const pedido = (extra: Record<string, unknown> = {}) => ({ agent: 'campaign-brief-agent', task: 'trivial', client_id: null, workflow_id: 'WF1', workflow_execution_id: '900', step_name: 'brief', ...extra })
  const req = (b: Record<string, unknown>) => new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) })
  let alCorredor: Array<Record<string, unknown>> = []
  beforeEach(() => {
    vi.clearAllMocks(); alCorredor = []; promesas.length = 0
    process.env.INTERNAL_API_KEY = 'k'; process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
    registrar.mockResolvedValue({ dispatch_key: 'dispatch:WF1:campaign-brief-agent:900', idempotent: false })
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { alCorredor.push(JSON.parse(init.body)); return new Response(JSON.stringify({ success: true, response: 'x', costUsd: 0.1 }), { status: 200, headers: { 'content-type': 'application/json' } }) }))
  })
  it('🔴 con tope (arriba o dentro de context) ⇒ el corredor recibe max_budget_usd · sin tope ⇒ el cuerpo de siempre', async () => {
    await POST(req(pedido({ max_budget_usd: 3 })))
    expect(alCorredor[0]).toMatchObject({ max_budget_usd: 3, agentName: 'campaign-brief-agent' })
    await POST(req(pedido({ context: { max_budget_usd: 2.5 } })))
    expect(alCorredor[1]).toMatchObject({ max_budget_usd: 2.5 })
    await POST(req(pedido()))
    expect(Object.prototype.hasOwnProperty.call(alCorredor[2], 'max_budget_usd')).toBe(false)
  })
  it.each([[0], [-1], ['abc'], [51], [null], [{}]])('🔴 tope mal escrito (%j) ⇒ 400 max_budget_usd_invalid y el corredor NO se llama (nada se gasta)', async (v) => {
    const r = await POST(req(pedido({ max_budget_usd: v })))
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ error: 'max_budget_usd_invalid', code: 'E-BUDGET-INVALID' })
    expect(alCorredor).toHaveLength(0)
  })
  it('por la vía asíncrona con la palanca del corredor el tope también llega (el pedido interno lo conserva)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { alCorredor.push(JSON.parse(init.body)); return new Response(JSON.stringify({ accepted: true, delivered_by: 'runner' }), { status: 202, headers: { 'content-type': 'application/json' } }) }))
    const r = await POST(req(pedido({ callback_url: N8N, callback_mode: 'runner', max_budget_usd: 3 })))
    await Promise.all(promesas)
    expect(r.status).toBe(202)
    expect(alCorredor[0]).toMatchObject({ callback_mode: 'runner', max_budget_usd: 3 })
  })
})

describe('④ un fallo del redactor (p. ej. el corte por tope) es un parte INVÁLIDO y la corrida no cierra en verde', () => {
  const N3 = '③ Armar el cuerpo del redactor'
  const CORTE = { success: false, agent: 'campaign-brief-agent', error: 'error_max_budget_usd · el empleado alcanzó el tope de gasto de la corrida (US$ 3) y se DETUVO · gastado ≈ US$ 3.0410 · lo escrito hasta ahí es PARCIAL', error_kind: 'runner_run_failed', cost_usd: 3.041, delivered_by: 'runner', response: '{"parte":{"entregables":[{"id":"BRF-0001"' }
  const base = { client_id: CID, client_name: 'Náufrago', dry_run: false, plan_id: 'p1', plan_texto: PLAN, manual_id: 'm1', manual_version: 1, forbidden_words: MANUAL.forbidden_words, required_terminology: MANUAL.required_terminology, cuerpo: { dry_run: false }, tope_usd: 3 }
  const vuelta = (cuerpoDeVuelta: Record<string, unknown>) => correrNodo('n3-llego-la-vuelta.js', { input: [{ body: cuerpoDeVuelta }], refs: { [N3]: { ...base, simulacro_respuesta: null } } })
  it('el fallo NO es una vuelta: motivo «el redactor FALLÓ», lo gastado se declara y el texto parcial NO se lee como parte', async () => {
    const [{ json }] = await vuelta(CORTE)
    expect(json.llego_la_vuelta).toBe(false)
    expect(json.falla_del_redactor).toMatch(/error_max_budget_usd/)
    expect(json.motivo).toMatch(/el redactor FALLÓ/)
    expect(json.motivo).not.toMatch(/se agotó la espera/)
    expect(json.texto).toBe('')
    expect(json.vuelta_costo_usd).toBe(3.041)
  })
  it('🔴 ④ el parte sale INVÁLIDO con el motivo verdadero · título marcado · el tope y lo gastado quedan en el registro', async () => {
    const [{ json: v }] = await vuelta(CORTE)
    const [{ json: c }] = await correrNodo('n4-chequeos-nodo.js', { input: [v] }, true)
    expect(c.parte_valido).toBe(false)
    expect(c.motivo_invalido).toMatch(/el redactor FALLÓ · error_max_budget_usd/)
    expect(c.titulo_parte).toMatch(/^⛔ PARTE NO VÁLIDO/)
    expect(c.parte_md).toContain('Motivo: el redactor FALLÓ')
    expect(c.fila_parte.provenance_tag).toMatchObject({ valido: false, tope_usd: 3, costo_usd: 3.041 })
    expect(c.payload_cable.resultado).toBe('parte_no_valido')
    expect(c.falla_del_redactor).toMatch(/error_max_budget_usd/)
    // la corrida NO cierra correcta: ⑤ arma el problema y ⑥ termina en error
    const [{ json: cierre }] = await correrNodo('n5-cierre.js', { refs: { '④ Chequeos': c, '⑤ Guardar el parte': { body: [{ id: 'f1' }] }, '⑤ Parte a Drive': { body: { ok: true, file_id: 'F', url: 'u' } } } })
    expect(cierre.ok).toBe(false)
    await expect(correrNodo('n6-volvio.js', { input: [{ ok: true }], refs: { '⓪ Sobre · llave · modo seco': { _sala_correlation_id: 'c1' }, '⑤ ¿Guardó y salió el PDF?': cierre } })).rejects.toThrow(/PARTE_NO_VALIDO/)
  })
  it('lo de siempre NO cambia: una vuelta buena se lee igual (con costo) y un parte sano sigue válido', async () => {
    const [{ json: v }] = await vuelta({ success: true, response: armarSimulacroSano(PLAN, MANUAL), cost_usd: 0.42 })
    expect(v).toMatchObject({ llego_la_vuelta: true, falla_del_redactor: null, vuelta_costo_usd: 0.42, motivo: null })
    const [{ json: c }] = await correrNodo('n4-chequeos-nodo.js', { input: [v] }, true)
    expect(c).toMatchObject({ parte_valido: true, motivo_invalido: null })
    expect(c.fila_parte.provenance_tag).toMatchObject({ tope_usd: 3, costo_usd: 0.42, valido: true })
  })
  it('una vuelta VACÍA sin success:false (espera agotada) sigue diciendo «se agotó la espera» (no se confunde con un fallo)', async () => {
    const [{ json }] = await correrNodo('n3-llego-la-vuelta.js', { input: [{}], refs: { [N3]: { ...base, simulacro_respuesta: null } } })
    expect(json.falla_del_redactor).toBeNull()
    expect(json.motivo).toMatch(/se agotó la espera/)
  })
  it('el corredor incluye lo gastado en el cuerpo del FALLO (y sólo si lo tiene)', () => {
    expect(cuerpoDeLaVuelta({ success: false, error: 'x', costUsd: 3.041 }, { agentName: 'a', dispatchKey: null })).toMatchObject({ success: false, cost_usd: 3.041, error_kind: 'runner_run_failed' })
    expect(cuerpoDeLaVuelta({ success: false, error: 'x' }, { agentName: 'a', dispatchKey: null })).not.toHaveProperty('cost_usd')
  })
  it('el flujo sigue siendo el mismo grafo (21 nodos) y todos sus nodos de código compilan', () => {
    const f = construirFlujo()
    expect(f.nodes).toHaveLength(21)
    for (const n of f.nodes.filter((x: { type: string }) => x.type.endsWith('.code'))) expect(() => new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', n.parameters.jsCode)).not.toThrow()
  })
})
