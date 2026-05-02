/**
 * Integration tests · GET /api/agent-outcomes (W18-T3 · W15-D-03).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const VALID_KEY = 'outcomes-read-test-key-1234567890abc'

interface MockRow {
  id: string
  agent_slug: string | null
  client_id: string | null
  latency_ms: number | null
  success: boolean | null
  error: string | null
  cost_usd: number | null
  created_at: string
  task_id?: string | null
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
      order() { return builder },
      eq() { return builder },
      limit() {
        return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      },
    }
    return { from() { return builder } }
  },
}))

import { GET } from '../src/app/api/agent-outcomes/route'

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
  return new Request(`http://localhost/api/agent-outcomes${qs ? '?' + qs : ''}`, { headers })
}

const fixtureRows: MockRow[] = [
  { id: 'a', agent_slug: 'campaign-brief', client_id: 'acme', latency_ms: 200, success: true, error: null, cost_usd: 0.01, created_at: '2026-05-02T10:00:00Z' },
  { id: 'b', agent_slug: 'campaign-brief', client_id: 'acme', latency_ms: 500, success: false, error: 'timeout', cost_usd: 0, created_at: '2026-05-02T10:05:00Z' },
  { id: 'c', agent_slug: 'qa', client_id: 'beta', latency_ms: 80, success: true, error: null, cost_usd: 0.005, created_at: '2026-05-02T10:10:00Z' },
]

describe('GET /api/agent-outcomes', () => {
  it('happy · returns raw outcomes + count when no group_by', async () => {
    state.rows = fixtureRows
    const res = await GET(req('minutes=15'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.count).toBe(3)
    expect(body.outcomes).toHaveLength(3)
    expect(body.window_minutes).toBe(15)
    expect(body.groups).toBeUndefined()
  })

  it('group_by=agent_slug · returns counts per agent (success/error breakdown)', async () => {
    state.rows = fixtureRows
    const res = await GET(req('group_by=agent_slug&minutes=60'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.group_by).toBe('agent_slug')
    expect(body.groups).toHaveLength(2)
    const cb = body.groups.find((g: { agent_slug: string }) => g.agent_slug === 'campaign-brief')
    expect(cb.count).toBe(2)
    expect(cb.success_count).toBe(1)
    expect(cb.error_count).toBe(1)
    expect(body.outcomes).toBeUndefined()
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await GET(req('', false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + fallback_mode + empty', async () => {
    state.error = { message: 'permission denied' }
    const res = await GET(req('minutes=30'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.outcomes).toEqual([])
    expect(body.count).toBe(0)
  })

  it('clamps minutes parameter to [1, 1440]', async () => {
    state.rows = []
    const res = await GET(req('minutes=99999'))
    const body = await res.json()
    expect(body.window_minutes).toBe(1440)
  })
})
