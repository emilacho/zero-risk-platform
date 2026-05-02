/**
 * Integration tests · GET /api/social-queue (W18-T4 · W15-D-26).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const VALID_KEY = 'social-queue-test-key-1234567890abcd'

interface MockRow {
  id: string
  client_id: string | null
  platform: string | null
  content: string | null
  media_url: string | null
  scheduled_for: string | null
  status: string | null
  created_at: string | null
}

const state: { rows: MockRow[]; error: { message: string } | null; lastFilters: Record<string, unknown> } = {
  rows: [],
  error: null,
  lastFilters: {},
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => {
    const builder = {
      select() { return builder },
      eq(col: string, val: unknown) { state.lastFilters[col] = val; return builder },
      order() { return builder },
      limit() {
        return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      },
    }
    return { from() { return builder } }
  },
}))

import { GET } from '../src/app/api/social-queue/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  process.env.INTERNAL_API_KEY = VALID_KEY
  state.rows = []
  state.error = null
  state.lastFilters = {}
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs = '', withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/social-queue${qs ? '?' + qs : ''}`, { headers })
}

describe('GET /api/social-queue', () => {
  it('happy · returns pending items by default', async () => {
    state.rows = [
      { id: '1', client_id: 'acme', platform: 'instagram', content: 'post 1', media_url: null, scheduled_for: null, status: 'pending', created_at: '2026-05-02T10:00:00Z' },
      { id: '2', client_id: 'acme', platform: 'twitter', content: 'post 2', media_url: null, scheduled_for: null, status: 'pending', created_at: '2026-05-02T10:01:00Z' },
    ]
    const res = await GET(req('limit=5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.status).toBe('pending')
    expect(body.count).toBe(2)
    expect(body.items).toHaveLength(2)
    expect(state.lastFilters.status).toBe('pending')
  })

  it('400 · invalid status value', async () => {
    const res = await GET(req('status=garbage'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('clamps limit to [1,50]', async () => {
    const res = await GET(req('limit=999'))
    const body = await res.json()
    expect(body.limit).toBe(50)
    const res2 = await GET(req('limit=0'))
    const body2 = await res2.json()
    expect(body2.limit).toBe(1)
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await GET(req('', false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + fallback_mode + empty', async () => {
    state.error = { message: 'relation "social_queue" does not exist' }
    const res = await GET(req('status=pending'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.items).toEqual([])
    expect(body.count).toBe(0)
  })
})
