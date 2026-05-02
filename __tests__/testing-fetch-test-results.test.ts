/**
 * Integration tests · POST /api/testing/fetch-test-results (W18-T1 · W15-D-30).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'fetch-results-test-key-1234567890ab'

let queryReturn: { data: unknown[] | null; error: { message: string } | null } = {
  data: [
    { id: 'res-1', experiment_id: 'exp-1', test_type: 'cro', status: 'running', p_value: 0.04, lift_pct: 8.2, sample_size: 1840, captured_at: '2026-05-02T10:00:00Z' },
    { id: 'res-2', experiment_id: 'exp-1', test_type: 'cro', status: 'completed', p_value: 0.02, lift_pct: 11.5, sample_size: 6200, captured_at: '2026-05-01T18:00:00Z' },
  ],
  error: null,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const builder: any = {
        select: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: () => builder,
        then: (onF: any) => Promise.resolve(queryReturn).then(onF),
      }
      return builder
    },
  }),
}))

import { POST } from '../src/app/api/testing/fetch-test-results/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  queryReturn = {
    data: [
      { id: 'res-1', experiment_id: 'exp-1', test_type: 'cro', status: 'running', p_value: 0.04, lift_pct: 8.2, sample_size: 1840, captured_at: '2026-05-02T10:00:00Z' },
      { id: 'res-2', experiment_id: 'exp-1', test_type: 'cro', status: 'completed', p_value: 0.02, lift_pct: 11.5, sample_size: 6200, captured_at: '2026-05-01T18:00:00Z' },
    ],
    error: null,
  }
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(body: unknown, withKey = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request('http://localhost/api/testing/fetch-test-results', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/testing/fetch-test-results', () => {
  it('happy path · returns 200 + count + results array', async () => {
    const res = await POST(req({ client_id: 'acme', test_type: 'cro' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.count).toBe(2)
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.filter.test_type).toBe('cro')
  })

  it('200 · empty body works (all filters optional)', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.filter.since_hours).toBe(24)
  })

  it('400 + E-INPUT-INVALID · invalid test_type enum', async () => {
    const res = await POST(req({ test_type: 'magical_test' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({}, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + empty + fallback_mode', async () => {
    queryReturn = { data: null, error: { message: 'relation "test_results" does not exist' } }
    const res = await POST(req({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.count).toBe(0)
  })
})
