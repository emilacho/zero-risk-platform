/**
 * Integration tests · POST /api/churn-predictions (W16-T2 · W15-D-07).
 *
 * Closes the silent-404 surfaced by the W15-T5 audit. Workflow caller:
 * `Zero Risk - Churn Prediction 90d Pre-Renewal (9am)`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'churn-predictions-test-key-1234567890ab'

const captured: { table?: string; row?: Record<string, unknown> } = {}
const insertSingle = vi.fn<() => Promise<{ data: { id: string } | null; error: { message: string } | null }>>(async () => ({
  data: { id: 'cp-00000000-0000-0000-0000-000000000001' },
  error: null,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      captured.table = table
      return {
        insert(row: Record<string, unknown>) {
          captured.row = row
          return {
            select: () => ({ single: insertSingle }),
          }
        },
      }
    },
  }),
}))

import { POST } from '../src/app/api/churn-predictions/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  captured.table = undefined
  captured.row = undefined
  insertSingle.mockClear()
  insertSingle.mockImplementation(async () => ({
    data: { id: 'cp-00000000-0000-0000-0000-000000000001' },
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
  return new Request('http://localhost/api/churn-predictions', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/churn-predictions', () => {
  it('happy path · persists row + returns 200 + persisted_id', async () => {
    const res = await POST(req({
      client_id: 'acme-2026',
      churn_probability: 0.42,
      prediction_window_days: 90,
      confidence: 0.81,
      top_factors: ['feature_use_drop', 'support_ticket_spike'],
      model_version: 'churn-v3',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.persisted_id).toBe('cp-00000000-0000-0000-0000-000000000001')
    expect(captured.table).toBe('churn_predictions')
    expect(captured.row).toMatchObject({
      client_id: 'acme-2026',
      churn_probability: 0.42,
      prediction_window_days: 90,
      model_version: 'churn-v3',
    })
  })

  it('400 + E-INPUT-INVALID · missing required client_id', async () => {
    const res = await POST(req({ churn_probability: 0.5 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('E-INPUT-INVALID')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('400 + E-INPUT-INVALID · churn_probability out of [0,1]', async () => {
    const res = await POST(req({ client_id: 'acme', churn_probability: 1.5 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('E-INPUT-INVALID')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ client_id: 'acme', churn_probability: 0.3 }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('graceful fallback · DB error → 200 + fallback_mode (workflow doesn\'t crash)', async () => {
    insertSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "churn_predictions" does not exist' },
    }))
    const res = await POST(req({ client_id: 'acme', churn_probability: 0.3 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.persisted_id).toBeNull()
  })
})
