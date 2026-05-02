/**
 * Integration tests · POST /api/metrics/fetch (W16-T2 · W15-D-21).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'metrics-fetch-test-key-1234567890abcd'

let queryReturn: { data: unknown[] | null; error: { message: string } | null } = {
  data: [
    { metric_name: 'roas', value: 3.4, captured_at: '2026-05-01T08:00:00Z', platform: 'meta', client_id: 'acme', dimensions: null },
    { metric_name: 'roas', value: 3.1, captured_at: '2026-04-30T08:00:00Z', platform: 'meta', client_id: 'acme', dimensions: null },
  ],
  error: null,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const builder: any = {
        select: () => builder,
        in: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: () => builder,
        lte: () => builder,
        then: (onF: any) => Promise.resolve(queryReturn).then(onF),
      }
      return builder
    },
  }),
}))

import { POST } from '../src/app/api/metrics/fetch/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  queryReturn = {
    data: [
      { metric_name: 'roas', value: 3.4, captured_at: '2026-05-01T08:00:00Z', platform: 'meta', client_id: 'acme', dimensions: null },
      { metric_name: 'roas', value: 3.1, captured_at: '2026-04-30T08:00:00Z', platform: 'meta', client_id: 'acme', dimensions: null },
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
  return new Request('http://localhost/api/metrics/fetch', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/metrics/fetch', () => {
  it('happy path · returns 200 + count + metrics array', async () => {
    const res = await POST(req({
      client_id: 'acme',
      metric_names: ['roas'],
      since_days: 7,
      platform: 'meta',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.count).toBe(2)
    expect(Array.isArray(body.metrics)).toBe(true)
    expect(body.filter.metric_names).toEqual(['roas'])
    expect(body.filter.since_days).toBe(7)
    expect(body.fallback_mode).toBeUndefined()
  })

  it('400 + E-INPUT-INVALID · missing required metric_names', async () => {
    const res = await POST(req({ client_id: 'acme' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-INVALID · empty metric_names array', async () => {
    const res = await POST(req({ metric_names: [] }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ metric_names: ['roas'] }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + empty array + fallback_mode', async () => {
    queryReturn = { data: null, error: { message: 'relation "performance_metrics" does not exist' } }
    const res = await POST(req({ metric_names: ['roas'] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.count).toBe(0)
    expect(body.metrics).toEqual([])
  })
})
