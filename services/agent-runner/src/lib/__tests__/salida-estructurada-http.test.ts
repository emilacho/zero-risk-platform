/**
 * SALIDA ESTRUCTURADA · la puerta HTTP real del corredor (express levantado de verdad, el SDK y la base simulados) · cadena PR 3.
 * Demuestra por comportamiento, no por texto: un esquema malo → 400 ANTES de llamar al corredor; uno bueno → llega al corredor como `outputSchema`; ausente → no existe la clave.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

const PUERTO = 18700 + Math.floor(Math.random() * 200)
process.env.PORT = String(PUERTO)
process.env.INTERNAL_API_KEY = 'llave-de-prueba'
process.env.AGENT_RUNNER_HEARTBEAT_MS = '0'

const llamadas: Array<Record<string, unknown>> = []
vi.mock('../../instrument.js', () => ({}))
vi.mock('@sentry/node', () => ({ withScope: () => {}, captureException: () => {}, captureMessage: () => {}, init: () => {}, setTag: () => {} }))
vi.mock('../agent-sdk-runner.js', () => ({
  runAgentViaSDK: async (input: Record<string, unknown>) => {
    llamadas.push(input)
    return { success: true, response: 'ok', sessionId: null, inputTokens: 1, outputTokens: 1, costUsd: 0, durationMs: 1, model: 'm', brainEnrichment: {}, cacheMetrics: {}, ...(input.outputSchema ? { structuredOutput: { a: 1 }, structuredOutputValid: true } : {}) }
  },
}))
vi.mock('../supabase.js', () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }))
vi.mock('../spend-gate.js', () => ({ checkSpendCap: async () => ({ ok: true }) }))
vi.mock('../braintrust.js', () => ({ flushBraintrust: async () => {} }))

const ESQUEMA = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'integer' } } }
const base = { agent: 'social-media-strategist', task: 'hola', workflow_id: 'wf1', workflow_execution_id: '1', client_id: 'c1', dry_run: true }
const post = (cuerpo: Record<string, unknown>) =>
  fetch(`http://127.0.0.1:${PUERTO}/run-sdk`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'llave-de-prueba' }, body: JSON.stringify(cuerpo) })

beforeAll(async () => {
  await import('../../index')
  await new Promise((r) => setTimeout(r, 300))
})
afterAll(() => { llamadas.length = 0 })

describe('POST /run-sdk · output_schema', () => {
  it('🔴 un esquema mal escrito se rechaza con 400 y NO llama al corredor', async () => {
    const antes = llamadas.length
    const r = await post({ ...base, output_schema: { type: 'object', properties: {} } })
    expect(r.status).toBe(400)
    const j = await r.json()
    expect(j.code).toBe('E-OUTPUT-SCHEMA-INVALID')
    expect(llamadas.length).toBe(antes)
  })
  it('🔴 `null` explícito tampoco es «ausente»: se rechaza', async () => {
    const r = await post({ ...base, output_schema: null })
    expect(r.status).toBe(400)
  })
  it('un esquema bueno llega al corredor como outputSchema (por el cuerpo, por el contexto y por extra) y el objeto vuelve', async () => {
    for (const cuerpo of [{ ...base, output_schema: ESQUEMA }, { ...base, context: { output_schema: ESQUEMA } }, { ...base, extra: { output_schema: ESQUEMA } }]) {
      const antes = llamadas.length
      const r = await post(cuerpo)
      expect(r.status).toBe(200)
      expect(llamadas.length).toBe(antes + 1)
      expect(llamadas[antes].outputSchema).toEqual(ESQUEMA)
      const j = await r.json()
      expect(j.structuredOutput).toEqual({ a: 1 })
    }
  })
  it('ausente ⇒ la clave no existe en lo que llega al corredor', async () => {
    const antes = llamadas.length
    const r = await post(base)
    expect(r.status).toBe(200)
    expect('outputSchema' in llamadas[antes]).toBe(false)
  })
})
