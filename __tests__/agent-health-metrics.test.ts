/**
 * Integration tests · GET /api/agent-health-metrics (W18-T3 · W15-D-02).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const VALID_KEY = 'health-metrics-test-key-1234567890ab'

interface MockRow {
  agent_slug: string | null
  latency_ms: number | null
  success: boolean | null
  cost_usd: number | null
}

const state: { rows: MockRow[]; error: { message: string } | null } = {
  rows: [],
  error: null,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => {
    const builder = {
      _filters: {} as Record<string, unknown>,
      select() { return builder },
      gte() { return builder },
      eq(col: string, val: unknown) { builder._filters[col] = val; return builder },
      limit() {
        return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      },
    }
    return {
      from() { return builder },
    }
  },
}))

import { GET } from '../src/app/api/agent-health-metrics/route'

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
  return new Request(`http://localhost/api/agent-health-metrics${qs ? '?' + qs : ''}`, { headers })
}

describe('GET /api/agent-health-metrics', () => {
  it('happy · aggregates by agent · returns overall + agents', async () => {
    state.rows = [
      { agent_slug: 'campaign-brief', latency_ms: 100, success: true, cost_usd: 0.01 },
      { agent_slug: 'campaign-brief', latency_ms: 200, success: true, cost_usd: 0.02 },
      { agent_slug: 'campaign-brief', latency_ms: 1000, success: false, cost_usd: 0.0 },
      { agent_slug: 'qa', latency_ms: 50, success: true, cost_usd: 0.005 },
    ]
    const res = await GET(req('minutes=15'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.window_minutes).toBe(15)
    expect(body.agents).toHaveLength(2)
    const cb = body.agents.find((a: { agent_slug: string }) => a.agent_slug === 'campaign-brief')
    expect(cb.invocations).toBe(3)
    expect(cb.error_rate).toBeCloseTo(1 / 3, 5)
    expect(cb.latency_avg_ms).toBeGreaterThan(0)
    expect(body.overall.invocations).toBe(4)
    expect(body.overall.success_rate).toBeCloseTo(0.75, 5)
  })

  it('clamps minutes to [1, 1440]', async () => {
    const res = await GET(req('minutes=99999'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.window_minutes).toBe(1440)
    const res2 = await GET(req('minutes=0'))
    const body2 = await res2.json()
    expect(body2.window_minutes).toBe(1)
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await GET(req('', false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + fallback_mode + empty agents', async () => {
    state.error = { message: 'relation "agent_outcomes" does not exist' }
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.agents).toEqual([])
    expect(body.overall.invocations).toBe(0)
  })

  it('empty result set · returns 200 with zero metrics', async () => {
    state.rows = []
    const res = await GET(req('minutes=60'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agents).toEqual([])
    expect(body.overall.invocations).toBe(0)
    expect(body.overall.error_rate).toBe(0)
    expect(body.overall.latency_p50_ms).toBeNull()
  })
})
