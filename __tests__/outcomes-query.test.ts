/**
 * Integration tests · POST /api/outcomes/query (W16-T2 · W15-D-24).
 *
 * Verifies the filter-shape + fallback path the Creative Performance Learner
 * cron uses to mine past agent_outcomes for "what worked" patterns.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Default mock: agent_outcomes returns null/error (table missing scenario).
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => ({
            eq: function () { return this },
            gte: function () { return this },
            lte: function () { return this },
            then: (onF: any) => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).then(onF),
          }),
        }),
      }),
    }),
  })),
}))

import { POST } from '../src/app/api/outcomes/query/route'

const VALID_KEY = 'outcomes-query-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function postReq(body: unknown, authed = true): Request {
  return new Request('http://localhost/api/outcomes/query', {
    method: 'POST',
    headers: authed
      ? { 'Content-Type': 'application/json', 'x-api-key': VALID_KEY }
      : { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/outcomes/query', () => {
  it('401 when x-api-key missing', async () => {
    const res = await POST(postReq({}, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('400 + E-INPUT-INVALID when limit exceeds 500', async () => {
    const res = await POST(postReq({ limit: 9999 }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-INVALID when min_confidence > 1', async () => {
    const res = await POST(postReq({ min_confidence: 1.5 }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-INVALID when outcome_type is not in enum', async () => {
    const res = await POST(postReq({ outcome_type: 'maybe' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('200 happy path returns empty + fallback_mode when table missing', async () => {
    const res = await POST(postReq({
      client_id: 'acme',
      agent_slug: 'content-creator',
      outcome_type: 'success',
      since_days: 7,
      limit: 50,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.count).toBe(0)
    expect(body.limit).toBe(50)
    expect(body.offset).toBe(0)
    expect(Array.isArray(body.rows)).toBe(true)
    expect(body.fallback_mode).toBe(true)
  })
})
