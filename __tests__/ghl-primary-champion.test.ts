/**
 * Integration tests · GET /api/ghl/primary-champion (W16-T1 · W15-D-13).
 *
 * Verifies the read-path that the
 * `Zero Risk — Client NPS + CSAT Monthly Pulse (1st of Month 10am)` cron uses
 * to figure out who to email the NPS prompt to.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// All three resolution-source tables fail → forces stub fallback.
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: function () { return this },
        gt: function () { return this },
        order: function () { return this },
        limit: function () { return this },
        maybeSingle: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
      }),
    }),
  })),
}))

import { GET } from '../src/app/api/ghl/primary-champion/route'

const VALID_KEY = 'champion-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, headers: Record<string, string> = { 'x-api-key': VALID_KEY }): Request {
  return new Request(`http://localhost/api/ghl/primary-champion${qs}`, { method: 'GET', headers })
}

describe('GET /api/ghl/primary-champion', () => {
  it('401 when x-api-key missing', async () => {
    const res = await GET(req('?client_id=acme', {}))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('400 + E-INPUT-MISSING when client_id absent', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-MISSING')
  })

  it('200 falls through all 3 sources to stub when DB unavailable', async () => {
    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.champion.email).toContain('@acme.example.com')
    expect(body.champion.source).toBe('stub')
  })

  it('stub email is deterministic per client_id (regression-stable)', async () => {
    const r1 = await GET(req('?client_id=Acme-Corp_001'))
    const r2 = await GET(req('?client_id=Acme-Corp_001'))
    const c1 = (await r1.json()).champion
    const c2 = (await r2.json()).champion
    expect(c1.email).toBe(c2.email)
    // Slug should normalize: alphanum-only, lowercase, max 30 chars
    expect(c1.email).toBe('champion@acmecorp001.example.com')
  })

  it('stub email handles unknown / pathological client_id without throwing', async () => {
    const res = await GET(req('?client_id=' + encodeURIComponent('???###!!!')))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Unmappable chars → "unknown" slug
    expect(body.champion.email).toBe('champion@unknown.example.com')
  })
})
