/**
 * Integration tests · GET /api/cost-usage (W18-T3 · W15-D-09).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const VALID_KEY = 'cost-usage-test-key-1234567890abcdef'

interface MockRow {
  service: string | null
  cost_usd: number | null
  occurred_at: string | null
}

const state: { rows: MockRow[]; error: { message: string } | null } = {
  rows: [],
  error: null,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => {
    const builder = {
      select() { return builder },
      gte() { return builder },
      eq() { return builder },
      limit() {
        return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      },
    }
    return { from() { return builder } }
  },
}))

import { GET } from '../src/app/api/cost-usage/route'

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
  return new Request(`http://localhost/api/cost-usage${qs ? '?' + qs : ''}`, { headers })
}

describe('GET /api/cost-usage', () => {
  it('happy · aggregates cost_events into per-service buckets (hourly)', async () => {
    const now = new Date()
    state.rows = [
      { service: 'anthropic', cost_usd: 0.50, occurred_at: now.toISOString() },
      { service: 'anthropic', cost_usd: 0.25, occurred_at: now.toISOString() },
      { service: 'openai', cost_usd: 0.10, occurred_at: now.toISOString() },
    ]
    const res = await GET(req('hours=24&granularity=hourly'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBeUndefined()
    expect(body.granularity).toBe('hour')
    expect(body.totals_usd.anthropic).toBeCloseTo(0.75, 4)
    expect(body.totals_usd.openai).toBeCloseTo(0.10, 4)
    expect(body.grand_total_usd).toBeCloseTo(0.85, 4)
  })

  it('granularity=day · buckets by date', async () => {
    state.rows = [
      { service: 'anthropic', cost_usd: 1.0, occurred_at: '2026-05-01T10:00:00Z' },
      { service: 'anthropic', cost_usd: 1.0, occurred_at: '2026-05-01T15:00:00Z' },
      { service: 'anthropic', cost_usd: 1.0, occurred_at: '2026-05-02T10:00:00Z' },
    ]
    const res = await GET(req('hours=72&granularity=day'))
    const body = await res.json()
    expect(body.granularity).toBe('day')
    const may1 = body.buckets.find((b: { bucket: string; service: string }) => b.bucket === '2026-05-01' && b.service === 'anthropic')
    expect(may1.cost_usd).toBeCloseTo(2.0, 4)
  })

  it('no rows · returns deterministic stub buckets + fallback_mode', async () => {
    state.rows = []
    const res = await GET(req('hours=6'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.fallback_mode).toBe(true)
    expect(body.buckets.length).toBeGreaterThan(0)
    expect(body.grand_total_usd).toBeGreaterThan(0)
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await GET(req('hours=24', false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + stub + fallback_mode', async () => {
    state.error = { message: 'connection refused' }
    const res = await GET(req('hours=12&granularity=hour'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.hours).toBe(12)
    expect(body.buckets.length).toBeGreaterThan(0)
  })
})
