/**
 * Integration tests · POST /api/testing/incrementality-results (W18-T1 · W15-D-31).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'inc-results-test-key-1234567890abcd'

const captured: { table?: string; row?: Record<string, unknown> } = {}
const insertSingle = vi.fn<() => Promise<{ data: { id: string } | null; error: { message: string } | null }>>(async () => ({
  data: { id: 'inc-00000000-0000-0000-0000-000000000031' },
  error: null,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      captured.table = table
      return {
        insert(row: Record<string, unknown>) {
          captured.row = row
          return { select: () => ({ single: insertSingle }) }
        },
      }
    },
  }),
}))

import { POST } from '../src/app/api/testing/incrementality-results/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  captured.table = undefined
  captured.row = undefined
  insertSingle.mockClear()
  insertSingle.mockImplementation(async () => ({
    data: { id: 'inc-00000000-0000-0000-0000-000000000031' },
    error: null,
  }))
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(body: unknown, withKey = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request('http://localhost/api/testing/incrementality-results', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/testing/incrementality-results', () => {
  it('happy path · persists result + significant flag derived from p_value', async () => {
    const res = await POST(req({
      experiment_id: 'exp-001',
      client_id: 'acme',
      test_type: 'incrementality',
      p_value: 0.03,
      lift_pct: 12.4,
      incremental_conversions: 84,
      sample_size: 5000,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.persisted_id).toBe('inc-00000000-0000-0000-0000-000000000031')
    expect(body.significant).toBe(true) // p_value < 0.05
    expect(captured.table).toBe('incrementality_results')
    expect(captured.row).toMatchObject({ experiment_id: 'exp-001', significant: true })
  })

  it('400 + E-INPUT-INVALID · missing required p_value', async () => {
    const res = await POST(req({ experiment_id: 'x', test_type: 'incrementality' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-INVALID · invalid test_type enum', async () => {
    const res = await POST(req({ experiment_id: 'x', test_type: 'guess', p_value: 0.05 }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ experiment_id: 'x', test_type: 'incrementality', p_value: 0.05 }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('high p_value (0.15) → significant: false', async () => {
    const res = await POST(req({
      experiment_id: 'exp-002',
      test_type: 'geo_holdout',
      p_value: 0.15,
      lift_pct: 2.1,
    }))
    const body = await res.json()
    expect(body.significant).toBe(false)
    expect(captured.row).toMatchObject({ significant: false })
  })
})
