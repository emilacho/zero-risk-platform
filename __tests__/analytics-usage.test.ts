/**
 * Integration tests · GET /api/analytics/usage (W18-T3 · W15-D-05).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const VALID_KEY = 'usage-test-key-1234567890abcdef1234'

interface MockEvent {
  user_id: string | null
  event_type: string | null
  occurred_at: string | null
}

const state: { rows: MockEvent[]; error: { message: string } | null } = {
  rows: [],
  error: null,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => {
    const builder = {
      select() { return builder },
      eq() { return builder },
      gte() { return builder },
      limit() {
        return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      },
    }
    return { from() { return builder } }
  },
}))

import { GET } from '../src/app/api/analytics/usage/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  process.env.INTERNAL_API_KEY = VALID_KEY
  state.rows = []
  state.error = null
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs = '', withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/analytics/usage${qs ? '?' + qs : ''}`, { headers })
}

describe('GET /api/analytics/usage', () => {
  it('happy · aggregates events by day/user/type', async () => {
    const today = new Date()
    const fiveDaysAgo = new Date(today.getTime() - 5 * 86_400_000)
    state.rows = [
      { user_id: 'u1', event_type: 'login', occurred_at: today.toISOString() },
      { user_id: 'u1', event_type: 'feature_touch', occurred_at: today.toISOString() },
      { user_id: 'u2', event_type: 'login', occurred_at: today.toISOString() },
      { user_id: 'u2', event_type: 'login', occurred_at: fiveDaysAgo.toISOString() },
      { user_id: 'u3', event_type: 'export', occurred_at: fiveDaysAgo.toISOString() },
    ]
    const res = await GET(req('client_id=acme&days=30'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBeUndefined()
    expect(body.metrics.unique_users).toBe(3)
    expect(body.metrics.events_total).toBe(5)
    expect(body.metrics.events_by_type.login).toBe(3)
    expect(body.metrics.active_days).toBeGreaterThanOrEqual(2)
  })

  it('no rows · returns deterministic stub with fallback_mode', async () => {
    state.rows = []
    const res = await GET(req('client_id=newco'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fallback_mode).toBe(true)
    expect(body.metrics.client_id).toBe('newco')
    expect(body.metrics.unique_users).toBeGreaterThan(0)
  })

  it('400 · missing client_id query param', async () => {
    const res = await GET(req('days=30'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-MISSING')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await GET(req('client_id=acme', false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + stub + fallback_mode', async () => {
    state.error = { message: 'relation "usage_events" does not exist' }
    const res = await GET(req('client_id=acme&days=14'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.metrics.client_id).toBe('acme')
    expect(body.metrics.days).toBe(14)
  })
})
