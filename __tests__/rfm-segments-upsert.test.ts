/**
 * Integration tests · POST /api/rfm-segments/upsert (W16-T2 · W15-D-25).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'rfm-segments-test-key-1234567890abcd'

const captured: { table?: string; row?: Record<string, unknown>; opts?: Record<string, unknown> } = {}
const upsertSingle = vi.fn(async () => ({
  data: { id: 'rfm-00000000-0000-0000-0000-000000000025' },
  error: null,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      captured.table = table
      return {
        upsert(row: Record<string, unknown>, opts: Record<string, unknown>) {
          captured.row = row
          captured.opts = opts
          return { select: () => ({ single: upsertSingle }) }
        },
      }
    },
  }),
}))

import { POST } from '../src/app/api/rfm-segments/upsert/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  captured.table = undefined
  captured.row = undefined
  captured.opts = undefined
  upsertSingle.mockClear()
  upsertSingle.mockImplementation(async () => ({
    data: { id: 'rfm-00000000-0000-0000-0000-000000000025' },
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
  return new Request('http://localhost/api/rfm-segments/upsert', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/rfm-segments/upsert', () => {
  it('happy path · upserts segment + returns 200 + persisted_id', async () => {
    const res = await POST(req({
      client_id: 'acme',
      contact_id: 'ct-42',
      segment: 'champions',
      recency_days: 5,
      frequency_30d: 8,
      monetary_lifetime_usd: 12500,
      rfm_score: '555',
      previous_segment: 'loyal',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.persisted_id).toBe('rfm-00000000-0000-0000-0000-000000000025')
    expect(captured.table).toBe('rfm_segments')
    expect(captured.opts).toMatchObject({ onConflict: 'client_id,contact_id' })
    expect(captured.row).toMatchObject({ segment: 'champions', previous_segment: 'loyal' })
  })

  it('400 + E-INPUT-INVALID · invalid segment enum value', async () => {
    const res = await POST(req({ client_id: 'acme', contact_id: 'ct', segment: 'super_users' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(upsertSingle).not.toHaveBeenCalled()
  })

  it('400 + E-INPUT-INVALID · missing required contact_id', async () => {
    const res = await POST(req({ client_id: 'acme', segment: 'loyal' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(upsertSingle).not.toHaveBeenCalled()
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ client_id: 'acme', contact_id: 'ct', segment: 'loyal' }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
    expect(upsertSingle).not.toHaveBeenCalled()
  })

  it('graceful fallback · DB error → 200 + fallback_mode', async () => {
    upsertSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "rfm_segments" does not exist' },
    }))
    const res = await POST(req({ client_id: 'acme', contact_id: 'ct', segment: 'loyal' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
  })
})
