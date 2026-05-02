/**
 * Integration tests · POST /api/community-health/upsert (W16-T2 · W15-D-08).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'community-health-test-key-1234567890ab'

const captured: { table?: string; row?: Record<string, unknown>; opts?: Record<string, unknown> } = {}
const upsertSingle = vi.fn<() => Promise<{ data: { id: string } | null; error: { message: string } | null }>>(async () => ({
  data: { id: 'ch-00000000-0000-0000-0000-0000000000aa' },
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

import { POST } from '../src/app/api/community-health/upsert/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  captured.table = undefined
  captured.row = undefined
  captured.opts = undefined
  upsertSingle.mockClear()
  upsertSingle.mockImplementation(async () => ({
    data: { id: 'ch-00000000-0000-0000-0000-0000000000aa' },
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
  return new Request('http://localhost/api/community-health/upsert', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/community-health/upsert', () => {
  it('happy path · upserts snapshot + returns 200 + persisted_id', async () => {
    const res = await POST(req({
      client_id: 'acme',
      snapshot_date: '2026-05-02',
      platform: 'discord',
      health_score: 78,
      active_members_24h: 142,
      new_members_24h: 7,
      engagement_rate_24h: 0.34,
      sentiment_score: 0.62,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.persisted_id).toBe('ch-00000000-0000-0000-0000-0000000000aa')
    expect(body.inserted).toBe(true)
    expect(captured.table).toBe('community_health_snapshots')
    expect(captured.opts).toMatchObject({ onConflict: 'client_id,snapshot_date,platform' })
    expect(captured.row).toMatchObject({ client_id: 'acme', platform: 'discord', health_score: 78 })
  })

  it('400 + E-INPUT-INVALID · missing snapshot_date', async () => {
    const res = await POST(req({ client_id: 'acme' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(upsertSingle).not.toHaveBeenCalled()
  })

  it('400 + E-INPUT-INVALID · sentiment_score below valid range', async () => {
    const res = await POST(req({
      client_id: 'acme',
      snapshot_date: '2026-05-02',
      sentiment_score: -2,
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(upsertSingle).not.toHaveBeenCalled()
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ client_id: 'acme', snapshot_date: '2026-05-02' }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
    expect(upsertSingle).not.toHaveBeenCalled()
  })

  it('graceful fallback · DB error → 200 + fallback_mode', async () => {
    upsertSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "community_health_snapshots" does not exist' },
    }))
    const res = await POST(req({ client_id: 'acme', snapshot_date: '2026-05-02', health_score: 50 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.persisted_id).toBeNull()
    expect(body.inserted).toBe(false)
  })
})
