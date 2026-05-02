/**
 * Integration tests · GET /api/ghl/expansion-intent (W16-T1 · W15-D-11).
 *
 * Verifies the expansion-readiness read-path that the
 * `Zero Risk — Expansion Readiness Scanner` Friday cron consumes.
 *
 * Coverage:
 *  - 401 when x-api-key missing
 *  - 400 when client_id query param missing
 *  - 200 happy path with stub fallback (no DB rows / table missing)
 *  - 200 since_days clamped to [1, 365]
 *  - smoke-prefixed client_id returns deterministic mid-tier stub score
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
            }),
          }),
        }),
      }),
    }),
  })),
}))

import { GET } from '../src/app/api/ghl/expansion-intent/route'

const VALID_KEY = 'expansion-intent-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, headers: Record<string, string> = { 'x-api-key': VALID_KEY }): Request {
  return new Request(`http://localhost/api/ghl/expansion-intent${qs}`, { method: 'GET', headers })
}

describe('GET /api/ghl/expansion-intent', () => {
  it('401 when x-api-key is missing', async () => {
    const res = await GET(req('?client_id=acme', {}))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('E-AUTH-001')
  })

  it('400 + E-INPUT-MISSING when client_id query param is absent', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('E-INPUT-MISSING')
  })

  it('200 happy path returns stub data with fallback_mode=true when DB unavailable', async () => {
    const res = await GET(req('?client_id=acme-corp'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.client_id).toBe('acme-corp')
    expect(body.fallback_mode).toBe(true)
    expect(Array.isArray(body.signals)).toBe(true)
    expect(typeof body.score).toBe('number')
    expect(body.score).toBeGreaterThanOrEqual(0)
    expect(body.score).toBeLessThanOrEqual(100)
  })

  it('clamps since_days to [1, 365] (extreme upper bound)', async () => {
    const res = await GET(req('?client_id=acme&since_days=99999'))
    const body = await res.json()
    expect(body.since_days).toBe(365)
  })

  it('smoke-prefixed client_id returns deterministic mid-tier score (regression-stable)', async () => {
    const res = await GET(req('?client_id=smoke-test-client-001'))
    const body = await res.json()
    expect(body.score).toBe(55) // stable mid-tier per stubSignals()
    expect(body.signals.length).toBeGreaterThan(0)
  })
})
