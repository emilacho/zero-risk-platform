/**
 * Integration tests · POST /api/expansion-opportunities (W16-T2 · W15-D-10).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'expansion-opp-test-key-1234567890abcd'

const captured: { table?: string; row?: Record<string, unknown> } = {}
const insertSingle = vi.fn<() => Promise<{ data: { id: string } | null; error: { message: string } | null }>>(async () => ({
  data: { id: 'eo-00000000-0000-0000-0000-000000000010' },
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

import { POST } from '../src/app/api/expansion-opportunities/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  captured.table = undefined
  captured.row = undefined
  insertSingle.mockClear()
  insertSingle.mockImplementation(async () => ({
    data: { id: 'eo-00000000-0000-0000-0000-000000000010' },
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
  return new Request('http://localhost/api/expansion-opportunities', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/expansion-opportunities', () => {
  it('happy path · persists opportunity + returns 200 + persisted_id', async () => {
    const res = await POST(req({
      client_id: 'acme',
      opportunity_type: 'upsell',
      score: 78.5,
      estimated_value_usd: 24000,
      confidence: 0.7,
      evidence: ['team_at_seat_cap', 'usage_above_p90'],
      next_action: 'Schedule expansion call',
      owner_role: 'jefe-client-success',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.persisted_id).toBe('eo-00000000-0000-0000-0000-000000000010')
    expect(captured.table).toBe('expansion_opportunities')
    expect(captured.row).toMatchObject({ client_id: 'acme', opportunity_type: 'upsell', score: 78.5 })
  })

  it('400 + E-INPUT-INVALID · invalid opportunity_type enum value', async () => {
    const res = await POST(req({
      client_id: 'acme',
      opportunity_type: 'megasale', // not in enum
      score: 50,
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('400 + E-INPUT-INVALID · score above max 100', async () => {
    const res = await POST(req({
      client_id: 'acme',
      opportunity_type: 'upsell',
      score: 150,
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ client_id: 'acme', opportunity_type: 'upsell', score: 50 }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('graceful fallback · DB error → 200 + fallback_mode', async () => {
    insertSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "expansion_opportunities" does not exist' },
    }))
    const res = await POST(req({ client_id: 'acme', opportunity_type: 'upsell', score: 50 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.persisted_id).toBeNull()
  })
})
