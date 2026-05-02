/**
 * Integration tests · POST /api/social-queue/update (W18-T4 · W15-D-27).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'sq-update-test-key-1234567890abcdef'

const captured: { patch?: Record<string, unknown>; whereId?: string } = {}
const updateResult = vi.fn<() => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>>(async () => ({
  data: [{ id: 'q-1' }],
  error: null,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from() {
      return {
        update(p: Record<string, unknown>) {
          captured.patch = p
          return {
            eq(_col: string, val: string) {
              captured.whereId = val
              return { select: () => updateResult() }
            },
          }
        },
      }
    },
  }),
}))

import { POST } from '../src/app/api/social-queue/update/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  captured.patch = undefined
  captured.whereId = undefined
  updateResult.mockClear()
  updateResult.mockImplementation(async () => ({ data: [{ id: 'q-1' }], error: null }))
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(body: unknown, withKey = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request('http://localhost/api/social-queue/update', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/social-queue/update', () => {
  it('happy path · marks row published with post_id + url', async () => {
    const res = await POST(req({
      id: 'q-1',
      status: 'published',
      platform: 'instagram',
      post_id: 'ig-12345',
      post_url: 'https://instagram.com/p/abc',
      published_at: '2026-05-02T10:00:00Z',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(true)
    expect(body.rows_affected).toBe(1)
    expect(captured.whereId).toBe('q-1')
    expect(captured.patch).toMatchObject({ status: 'published', platform: 'instagram', post_id: 'ig-12345' })
  })

  it('400 + E-INPUT-INVALID · invalid status enum', async () => {
    const res = await POST(req({ id: 'q-1', status: 'flying' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-INVALID · missing required id', async () => {
    const res = await POST(req({ status: 'published' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ id: 'q-1', status: 'failed' }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + fallback_mode + updated:false', async () => {
    updateResult.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "social_queue" does not exist' },
    }))
    const res = await POST(req({ id: 'q-2', status: 'failed', error: 'API timeout' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.updated).toBe(false)
  })
})
