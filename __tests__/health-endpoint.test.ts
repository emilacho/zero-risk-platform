/**
 * Sprint Monitoreo FASE 2 (H1) · CC#2 · /api/health aggregation tests.
 *
 * Verifies the 4-service roll-up + overall status (ok/degraded/down) + HTTP
 * code, with fetch (n8n · agent_runner) and Supabase mocked. NO network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const state = vi.hoisted(() => ({ supabaseError: null as unknown }))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve({ error: state.supabaseError }),
      }),
    }),
  })),
}))

import { GET } from '../src/app/api/health/route'

const ORIG = { n8n: process.env.N8N_BASE_URL, runner: process.env.RAILWAY_AGENT_RUNNER_URL }

beforeEach(() => {
  state.supabaseError = null
  process.env.N8N_BASE_URL = 'https://n8n.test'
  process.env.RAILWAY_AGENT_RUNNER_URL = 'https://runner.test'
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response))
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIG.n8n === undefined) delete process.env.N8N_BASE_URL
  else process.env.N8N_BASE_URL = ORIG.n8n
  if (ORIG.runner === undefined) delete process.env.RAILWAY_AGENT_RUNNER_URL
  else process.env.RAILWAY_AGENT_RUNNER_URL = ORIG.runner
})

describe('GET /api/health · aggregation', () => {
  it('all services ok → status ok · HTTP 200', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.services).toMatchObject({ n8n: 'ok', vercel: 'ok', agent_runner: 'ok', supabase: 'ok' })
    expect(body.timestamp).toBeTruthy()
    expect(body.latency_ms).toHaveProperty('n8n')
    expect(body.latency_ms).toHaveProperty('agent_runner')
    expect(body.latency_ms).toHaveProperty('supabase')
  })

  it('n8n non-2xx → status down · HTTP 503 · n8n marked down', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: !String(url).includes('n8n') }) as Response))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('down')
    expect(body.services.n8n).toBe('down')
    expect(body.services.agent_runner).toBe('ok')
  })

  it('agent_runner fetch throws → down · 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('runner')) throw new Error('ECONNREFUSED')
      return { ok: true } as Response
    }))
    const res = await GET()
    expect(res.status).toBe(503)
    expect((await res.json()).services.agent_runner).toBe('down')
  })

  it('supabase error → down · 503', async () => {
    state.supabaseError = { message: 'relation does not exist' }
    const res = await GET()
    expect(res.status).toBe(503)
    expect((await res.json()).services.supabase).toBe('down')
  })

  it('missing N8N_BASE_URL env → n8n down (no crash)', async () => {
    delete process.env.N8N_BASE_URL
    const res = await GET()
    const body = await res.json()
    expect(body.services.n8n).toBe('down')
    expect(body.services.vercel).toBe('ok')
  })

  it('vercel is always ok (self-check)', async () => {
    const body = await (await GET()).json()
    expect(body.services.vercel).toBe('ok')
  })
})
