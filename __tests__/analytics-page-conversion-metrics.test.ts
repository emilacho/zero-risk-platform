/**
 * Integration tests · GET /api/analytics/page-conversion-metrics (W18-T3 · W15-D-04).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const VALID_KEY = 'page-conv-test-key-1234567890abcdef'

interface MockRow {
  url: string
  sessions: number | null
  conversions: number | null
  conversion_rate: number | null
  bounce_rate: number | null
  avg_session_duration_sec: number | null
  measured_from: string | null
  measured_to: string | null
}

const state: { rows: MockRow[]; error: { message: string } | null } = {
  rows: [],
  error: null,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => {
    const builder = {
      select() { return builder },
      eq() { return builder },
      gte() { return builder },
      order() { return builder },
      limit() {
        return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      },
    }
    return { from() { return builder } }
  },
}))

import { GET } from '../src/app/api/analytics/page-conversion-metrics/route'

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
  return new Request(`http://localhost/api/analytics/page-conversion-metrics${qs ? '?' + qs : ''}`, { headers })
}

describe('GET /api/analytics/page-conversion-metrics', () => {
  it('happy · DB row present · returns metrics from row', async () => {
    state.rows = [{
      url: 'https://acme.com/lp/v1',
      sessions: 1500,
      conversions: 75,
      conversion_rate: 0.05,
      bounce_rate: 0.42,
      avg_session_duration_sec: 95,
      measured_from: '2026-04-01T00:00:00Z',
      measured_to: '2026-05-01T00:00:00Z',
    }]
    const res = await GET(req('url=' + encodeURIComponent('https://acme.com/lp/v1') + '&days=30'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBeUndefined()
    expect(body.metrics.sessions).toBe(1500)
    expect(body.metrics.conversion_rate).toBe(0.05)
  })

  it('no rows · returns deterministic stub + fallback_mode', async () => {
    state.rows = []
    const res = await GET(req('url=' + encodeURIComponent('https://acme.com/lp/v2')))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.metrics.url).toBe('https://acme.com/lp/v2')
    expect(typeof body.metrics.sessions).toBe('number')
    expect(body.metrics.conversion_rate).toBeGreaterThan(0)
    expect(body.metrics.conversion_rate).toBeLessThan(0.1)
  })

  it('400 · missing url query param', async () => {
    const res = await GET(req('days=30'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('E-INPUT-MISSING')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await GET(req('url=' + encodeURIComponent('https://x.com'), false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + stub + fallback_mode', async () => {
    state.error = { message: 'relation "page_conversion_metrics" does not exist' }
    const res = await GET(req('url=' + encodeURIComponent('https://acme.com/lp/v3')))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.metrics.url).toBe('https://acme.com/lp/v3')
    expect(body.note).toMatch(/page_conversion_metrics|GA4/)
  })
})
