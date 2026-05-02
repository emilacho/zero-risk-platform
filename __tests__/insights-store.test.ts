/**
 * Integration tests · POST /api/insights/store (W16-T2 · W15-D-19).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'insights-store-test-key-1234567890ab'

const captured: { table?: string; row?: Record<string, unknown> } = {}
const insertSingle = vi.fn(async () => ({
  data: { id: 'in-00000000-0000-0000-0000-000000000019' },
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

import { POST } from '../src/app/api/insights/store/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  captured.table = undefined
  captured.row = undefined
  insertSingle.mockClear()
  insertSingle.mockImplementation(async () => ({
    data: { id: 'in-00000000-0000-0000-0000-000000000019' },
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
  return new Request('http://localhost/api/insights/store', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/insights/store', () => {
  it('happy path · persists insight + returns 200 + persisted_id', async () => {
    const res = await POST(req({
      client_id: 'acme',
      insight_type: 'creative_fatigue_detected',
      payload: { campaign_id: 'cmp-9', frequency: 4.7, ctr_drop_pct: 38 },
      source: 'creative-performance-learner',
      confidence: 0.84,
      evidence: ['frequency_above_4', 'ctr_decline_2_weeks'],
      agent_slug: 'creative-learner',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.persisted_id).toBe('in-00000000-0000-0000-0000-000000000019')
    expect(captured.table).toBe('agent_insights')
    expect(captured.row).toMatchObject({ insight_type: 'creative_fatigue_detected', source: 'creative-performance-learner' })
  })

  it('400 + E-INPUT-INVALID · missing required insight_type', async () => {
    const res = await POST(req({ payload: { foo: 'bar' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('400 + E-INPUT-INVALID · payload not an object', async () => {
    const res = await POST(req({ insight_type: 'x', payload: 'not-an-object' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ insight_type: 'x', payload: {} }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('graceful fallback · DB error → 200 + fallback_mode', async () => {
    insertSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "agent_insights" does not exist' },
    }))
    const res = await POST(req({ insight_type: 'x', payload: {} }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
  })
})
