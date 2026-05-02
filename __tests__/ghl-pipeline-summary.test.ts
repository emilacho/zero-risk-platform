/**
 * Integration tests · GET /api/ghl/pipeline-summary (W16-T1 · W15-D-12).
 *
 * Verifies the read-path that the
 * `Zero Risk — Weekly Client Report Generator v2 (Mondays 8am)` cron consumes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              eq: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
              then: (onF: any) => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).then(onF),
            }),
          }),
        }),
      }),
    }),
  })),
}))

import { GET } from '../src/app/api/ghl/pipeline-summary/route'

const VALID_KEY = 'pipeline-summary-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, headers: Record<string, string> = { 'x-api-key': VALID_KEY }): Request {
  return new Request(`http://localhost/api/ghl/pipeline-summary${qs}`, { method: 'GET', headers })
}

describe('GET /api/ghl/pipeline-summary', () => {
  it('401 when x-api-key missing', async () => {
    const res = await GET(req('?client_id=acme', {}))
    expect(res.status).toBe(401)
  })

  it('400 + E-INPUT-MISSING when client_id absent', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-MISSING')
  })

  it('200 happy path returns stages + totals with fallback_mode', async () => {
    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.client_id).toBe('acme')
    expect(Array.isArray(body.stages)).toBe(true)
    expect(body.stages.length).toBeGreaterThan(0)
    expect(body.totals).toHaveProperty('deals')
    expect(body.totals).toHaveProperty('value_usd')
    expect(body.totals).toHaveProperty('weighted_value_usd')
    expect(body.fallback_mode).toBe(true)
  })

  it('passes through pipeline_id query param into response', async () => {
    const res = await GET(req('?client_id=acme&pipeline_id=PL-42'))
    const body = await res.json()
    expect(body.pipeline_id).toBe('PL-42')
  })

  it('totals.value_usd is sum of stages.value_usd (consistency guarantee)', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const sum = body.stages.reduce((s: number, x: any) => s + x.value_usd, 0)
    expect(body.totals.value_usd).toBe(sum)
  })
})
