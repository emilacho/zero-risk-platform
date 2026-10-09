/**
 * RELEVO 25 · MODELO POR CORRIDA (opt-in) · pruebas PERMANENTES, US$ 0, sin red ni modelo.
 * Lo que cuidan: solo ids de una lista corta (familia Opus) · un id mal escrito se rechaza ANTES de medir el freno y de llamar al corredor · sin el campo, el cuerpo al corredor es el de siempre ·
 * la lista de la ruta y la del corredor son LA MISMA · el corredor aplica el override solo a esa corrida (no toca `agents.model`) y lo deja en el libro.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn(), setTag: vi.fn(), withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))
const medirFreno = vi.fn()
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: (...a: unknown[]) => medirFreno(...a) }))
const promesas: Promise<unknown>[] = []
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { promesas.push(p) } }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'insert', 'update', 'upsert']) q[m] = () => q; q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r); q.maybeSingle = async () => ({ data: null, error: null }); q.single = q.maybeSingle; return q } }),
}))
const registrar = vi.fn().mockResolvedValue({ dispatch_key: 'dispatch:WF1:social-media-strategist:900', idempotent: false })
vi.mock('@/lib/agent-dispatch-ledger', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-dispatch-ledger')>()), recordDispatchIntent: (...a: unknown[]) => registrar(...a), markDispatchRunning: vi.fn().mockResolvedValue(undefined), markDispatchTerminal: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/agent-async-callback', async (orig) => ({ ...(await orig<typeof import('@/lib/agent-async-callback')>()), dispatchAsyncCallback: vi.fn().mockResolvedValue({ ok: true, status: 'ok', status_code: 200, duration_ms: 1, attempts: 1 }) }))
import { POST } from '@/app/api/agents/run-sdk/route'
import { MODELOS_POR_CORRIDA, modeloPorCorridaValido } from '@/lib/modelo-por-corrida'
import { MODELOS_POR_CORRIDA as DEL_CORREDOR, resolverModelo } from '../services/agent-runner/src/lib/modelo-por-corrida'

const RAIZ = process.cwd()
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const pedido = (extra: Record<string, unknown> = {}) => ({ agent: 'social-media-strategist', task: 'trivial', client_id: CID, workflow_id: 'WF1', workflow_execution_id: '900', step_name: 'prueba', dry_run: true, ...extra })
const req = (b: Record<string, unknown>) => new Request('https://prod.test/api/agents/run-sdk', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) })
let alCorredor: Array<Record<string, unknown>> = []
beforeEach(() => {
  vi.clearAllMocks(); alCorredor = []; promesas.length = 0
  process.env.INTERNAL_API_KEY = 'k'; process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
  registrar.mockResolvedValue({ dispatch_key: 'dispatch:WF1:social-media-strategist:900', idempotent: false })
  medirFreno.mockResolvedValue({ blocked: false })
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { alCorredor.push(JSON.parse(init.body)); return new Response(JSON.stringify({ success: true, response: 'x', costUsd: 0.1 }), { status: 200, headers: { 'content-type': 'application/json' } }) }))
})

describe('la lista corta', () => {
  it('es la MISMA en la ruta y en el corredor (una sola fuente de verdad probada) y solo trae la familia Opus', () => {
    expect([...MODELOS_POR_CORRIDA]).toEqual([...DEL_CORREDOR])
    expect(MODELOS_POR_CORRIDA.every((m) => /^claude-opus-[0-9]+(-[0-9]+)?$/.test(m))).toBe(true)
    expect(MODELOS_POR_CORRIDA).toContain('claude-opus-5-5')
    // el texto de ambos archivos declara la misma lista (por si alguien la edita en un lado)
    const a = /MODELOS_POR_CORRIDA = (\[[^\]]*\])/.exec(leer('src/lib/modelo-por-corrida.ts'))?.[1]
    const b = /MODELOS_POR_CORRIDA = (\[[^\]]*\])/.exec(leer('services/agent-runner/src/lib/modelo-por-corrida.ts'))?.[1]
    expect(a).toBeDefined(); expect(a).toBe(b)
  })
  it('modeloPorCorridaValido acepta SOLO los de la lista, tal cual escritos', () => {
    for (const m of MODELOS_POR_CORRIDA) expect(modeloPorCorridaValido(m)).toBe(true)
    for (const mal of ['claude-sonnet', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus', 'claude-opus-4-6', 'CLAUDE-OPUS-5-5', ' claude-opus-5-5', 'claude-opus-5-5 ', '', null, undefined, 5, {}, ['claude-opus-5-5']]) expect(modeloPorCorridaValido(mal), String(mal)).toBe(false)
  })
})

describe('resolverModelo (corredor)', () => {
  it('ausente ⇒ sin override (camino de siempre)', () => {
    expect(resolverModelo()).toEqual({ ok: true, valor: null })
    expect(resolverModelo(undefined, undefined, undefined, undefined)).toEqual({ ok: true, valor: null })
  })
  it('un id de la lista se acepta; el primer candidato presente manda (cuerpo antes que context)', () => {
    expect(resolverModelo(undefined, 'claude-opus-5-5')).toEqual({ ok: true, valor: 'claude-opus-5-5' })
    expect(resolverModelo('claude-opus-5', 'claude-opus-4-8')).toEqual({ ok: true, valor: 'claude-opus-5' })
    expect(resolverModelo(undefined, undefined, undefined, 'claude-opus-4-7')).toEqual({ ok: true, valor: 'claude-opus-4-7' })
  })
  it('algo fuera de la lista (o `null` explícito) se RECHAZA con el motivo, no se ignora', () => {
    for (const mal of ['claude-sonnet-5-5', 'claude-fable-5-1', 'opus', '', null, 7, true]) {
      const r = resolverModelo(mal)
      expect(r.ok, String(mal)).toBe(false)
      if (!r.ok) expect(r.motivo).toContain('model_override debe ser uno de')
    }
    // un valor presente-pero-malo no lo tapa uno bueno que viene después
    expect(resolverModelo('claude-sonnet-5-5', 'claude-opus-5-5').ok).toBe(false)
  })
})

describe('🔴 la ruta run-sdk: un id mal escrito se rechaza ANTES de medir el freno y de llamar al corredor', () => {
  it.each([
    ['fuera de la lista', { model_override: 'claude-sonnet-5-5' }],
    ['de otra familia', { model_override: 'claude-fable-5-1' }],
    ['vacío', { model_override: '' }],
    ['nulo', { model_override: null }],
    ['número', { model_override: 5 }],
    ['en context', { context: { model_override: 'gpt-5' } }],
  ])('%s ⇒ 400 model_override_invalid · el freno NO se mide · el corredor NO se llama', async (_n, extra) => {
    const r = await POST(req(pedido(extra as Record<string, unknown>)))
    expect(r.status).toBe(400)
    const j = await r.json()
    expect(j.error).toBe('model_override_invalid'); expect(j.code).toBe('E-MODEL-OVERRIDE-INVALID')
    expect(medirFreno).not.toHaveBeenCalled(); expect(alCorredor).toHaveLength(0)
  })
})

describe('la ruta run-sdk: lo válido llega al corredor y lo de siempre NO cambia', () => {
  it('con un id de la lista: el corredor recibe `model_override` tal cual (en el cuerpo o en context)', async () => {
    const a = await POST(req(pedido({ dry_run: false, model_override: 'claude-opus-5-5', max_budget_usd: 2 })))
    expect(a.status).toBe(200)
    expect(alCorredor[0]).toMatchObject({ model_override: 'claude-opus-5-5', max_budget_usd: 2 })
    alCorredor = []
    const b = await POST(req(pedido({ dry_run: false, context: { model_override: 'claude-opus-4-8' } })))
    expect(b.status).toBe(200)
    expect(alCorredor[0]).toMatchObject({ model_override: 'claude-opus-4-8' })
  })
  it('sin el campo: el cuerpo al corredor NO trae la clave (idéntico al de siempre) y se mide el freno una vez', async () => {
    await POST(req(pedido({ dry_run: false })))
    expect(medirFreno).toHaveBeenCalledTimes(1)
    expect(Object.prototype.hasOwnProperty.call(alCorredor[0], 'model_override')).toBe(false)
  })
})

describe('el corredor: el override vale solo para esa corrida y queda en el libro', () => {
  const runner = leer('services/agent-runner/src/lib/agent-sdk-runner.ts')
  const indice = leer('services/agent-runner/src/index.ts')
  it('el modelo efectivo es el override si viene y, si no, el de siempre (agents.model/registro)', () => {
    expect(runner).toMatch(/const modelId = input\.modelOverride \?\? MODEL_MAP\[modelKey\] \?\? MODEL_MAP\['claude-sonnet'\]/)
  })
  it('NO escribe nada en `agents` ni en el registro para cambiar el modelo', () => {
    expect(runner).not.toMatch(/\.from\('agents'\)\s*\.\s*update|default_model\s*:\s*input\.modelOverride/)
  })
  it('el libro (metadata) lleva `model_override` SOLO cuando el pedido lo trajo', () => {
    expect(runner).toMatch(/\.\.\.\(input\.modelOverride \? \{ model_override: input\.modelOverride \} : \{\}\)/)
  })
  it('el servidor del corredor lo valida (400 antes de gastar) y lo pasa a la corrida', () => {
    expect(indice).toMatch(/resolverModelo\(body\.modelOverride, body\.model_override, ctxObj\.modelOverride, ctxObj\.model_override\)/)
    expect(indice).toMatch(/if \(!modelo\.ok\) \{\s*res\.status\(400\)\.json\(\{ success: false, error: 'model_override_invalid', code: 'E-MODEL-OVERRIDE-INVALID', detail: modelo\.motivo \}\)\s*return\s*\}/)
    expect(indice).toMatch(/\.\.\.\(modelo\.valor !== null \? \{ modelOverride: modelo\.valor \} : \{\}\)/)
    expect(indice.indexOf('resolverModelo(body.modelOverride')).toBeLessThan(indice.indexOf('const input: AgentRunInput'))
  })
  it('el precio de la corrida se calcula con la tabla de Opus (un id de la lista contiene «opus»)', () => {
    expect(MODELOS_POR_CORRIDA.every((m) => m.includes('opus'))).toBe(true)
    expect(runner).toMatch(/model\.includes\('opus'\) \? 'opus'/)
  })
})
