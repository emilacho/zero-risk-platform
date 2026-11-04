/**
 * 04-nov · cada llamada guarda de qué trabajo es · las puertas de verdad (sin llamar a nadie):
 * lo que llega a `run-sdk` sigue al corredor, entra al despacho y a la fila del registro local; y la respuesta dice qué llamada fue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

const escrito: Array<{ tabla: string; fila: Record<string, unknown> }> = []
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn(), setTag: vi.fn(), withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: vi.fn().mockResolvedValue({ blocked: false }) }))
vi.mock('@vercel/functions', () => ({ waitUntil: (_p: Promise<unknown>) => {} }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (tabla: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'update', 'upsert', 'is', 'neq']) q[m] = () => q
      q.insert = (f: Record<string, unknown> | Record<string, unknown>[]) => { escrito.push({ tabla, fila: Array.isArray(f) ? f[0] : f }); return q }
      q.maybeSingle = async () => ({ data: null, error: null })
      q.single = async () => ({ data: { id: 'fila-1' }, error: null })
      q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(r)
      return q
    },
  }),
}))
import { POST } from '@/app/api/agents/run-sdk/route'
import { POST as registrar } from '@/app/api/agents/log-invocation/route'

const base = { agent: 'campaign-brief-agent', task: 'trivial', client_id: null, workflow_id: 'WF1', workflow_execution_id: '900' }
const req = (b: Record<string, unknown>, encabezados: Record<string, string> = {}, ruta = 'run-sdk') =>
  new Request(`https://prod.test/api/agents/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k', ...encabezados }, body: JSON.stringify(b) })
let alCorredor: Array<Record<string, unknown>> = []
beforeEach(() => {
  vi.clearAllMocks(); alCorredor = []; escrito.length = 0
  process.env.INTERNAL_API_KEY = 'k'; process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
    alCorredor.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ success: true, invocationId: 'inv-7', response: 'ok', sessionId: 's', inputTokens: 1, outputTokens: 1, costUsd: 0, durationMs: 1, model: 'm' }), { status: 200 })
  }))
})

describe('run-sdk sigue al corredor con los datos', () => {
  it('🔴 del cuerpo, de `context` y de los encabezados', async () => {
    const datos = { trabajo_tipo: 'pedido', trabajo_id: 'p1', paso: 'consolidar', llamada_padre: 'i1' }
    await POST(req({ ...base, ...datos }))
    expect(alCorredor[0]).toMatchObject(datos)
    alCorredor = []
    await POST(req({ ...base, context: datos }))
    expect(alCorredor[0]).toMatchObject(datos)
    alCorredor = []
    await POST(req(base, { 'x-zr-trabajo-tipo': 'pedido', 'x-zr-trabajo-id': 'p1', 'x-zr-paso': 'consolidar', 'x-zr-llamada-padre': 'i1' }))
    expect(alCorredor[0]).toMatchObject(datos)
  })
  it('🔴 un tipo mal escrito NO frena la llamada: llega al corredor, que lo anota', async () => {
    const r = await POST(req({ ...base, trabajo_tipo: 'reunion', trabajo_id: 'x' }))
    expect(r.status).toBe(200)
    expect(alCorredor).toHaveLength(1)
  })
  it('sin datos: ninguna de las llaves viaja', async () => {
    await POST(req(base))
    for (const c of ['trabajo_tipo', 'trabajo_id', 'paso', 'llamada_padre']) expect(alCorredor[0]).not.toHaveProperty(c)
  })
  it('🔴 la respuesta dice qué llamada fue', async () => {
    const r = await POST(req(base))
    expect((await r.json()).invocation_id).toBe('inv-7')
  })
})

describe('el despacho (con vuelta)', () => {
  it('🔴 guarda los datos en columnas antes de contestar', async () => {
    const r = await POST(req({ ...base, callback_url: 'https://n8n.test/cb', trabajo_tipo: 'alta', trabajo_id: 'j1', paso: 'lentes', llamada_padre: 'i1' }))
    expect(r.status).toBe(202)
    const d = escrito.find((e) => e.tabla === 'agent_dispatches')?.fila
    expect(d).toMatchObject({ trabajo_tipo: 'alta', trabajo_id: 'j1', paso: 'lentes', llamada_padre: 'i1' })
  })
  it('🔴 lo mal escrito no frena el despacho y queda anotado', async () => {
    const r = await POST(req({ ...base, callback_url: 'https://n8n.test/cb', trabajo_tipo: 'reunion', trabajo_id: 'x' }))
    expect(r.status).toBe(202)
    const d = escrito.find((e) => e.tabla === 'agent_dispatches')?.fila as Record<string, any>
    expect(d).not.toHaveProperty('trabajo_tipo')
    expect(d.metadata.trabajo_invalido).toEqual(['trabajo_tipo_desconocido'])
  })
})

describe('el registro local', () => {
  it('🔴 guarda los datos en columnas', async () => {
    const r = await registrar(req({ agent_name: 'a', workflow_id: 'w', workflow_execution_id: 'e', started_at: '2026-11-04T10:00:00Z', ended_at: '2026-11-04T10:00:01Z', session_id: 's', trabajo_tipo: 'plan', trabajo_id: 'c1', paso: 'p' }, {}, 'log-invocation'))
    expect(r.status).toBe(200)
    expect(escrito.find((e) => e.tabla === 'agent_invocations')?.fila).toMatchObject({ trabajo_tipo: 'plan', trabajo_id: 'c1', paso: 'p' })
  })
})

describe('las puertas que no se levantan en esta prueba leen los datos al escribir la fila', () => {
  it.each([
    ['src/app/api/agents/run/route.ts', '...trabajoDeLaFila.columnas'],
    ['src/app/api/images/generate/route.ts', 'trabajo: trabajoDeLaLlamada(body'],
    ['src/app/api/video/generate/route.ts', 'trabajo: trabajoDeLaLlamada(body'],
    ['services/agent-runner/src/index.ts', 'trabajo: trabajoDeLaLlamada(body'],
  ])('%s', (archivo, texto) => {
    expect(readFileSync(archivo, 'utf8')).toContain(texto)
  })
})
