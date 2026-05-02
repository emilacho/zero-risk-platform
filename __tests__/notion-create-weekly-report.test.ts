/**
 * Integration tests · POST /api/notion/create-weekly-report (W18-T2 · W15-D-23).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'notion-weekly-test-key-1234567890abc'

const insertSingle = vi.fn<() => Promise<{ data: { id: string } | null; error: { message: string } | null }>>(async () => ({
  data: { id: 'notion-log-00000000-0000-0000-0000-000000000023' },
  error: null,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: insertSingle }) }),
    }),
  }),
}))

import { POST } from '../src/app/api/notion/create-weekly-report/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  insertSingle.mockClear()
  insertSingle.mockImplementation(async () => ({
    data: { id: 'notion-log-00000000-0000-0000-0000-000000000023' },
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
  return new Request('http://localhost/api/notion/create-weekly-report', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/notion/create-weekly-report', () => {
  it('happy path · returns 200 + page_id + notion_url', async () => {
    const res = await POST(req({
      client_id: 'acme',
      week_starting: '2026-04-28',
      title: 'Acme Weekly Report · Apr 28-May 4',
      highlights: ['Shipped feature Y', 'CSAT 92'],
      next_week_focus: ['Run NPS pulse'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.page_id).toMatch(/notion-weekly-acme-2026-04-28/)
    expect(body.week_starting).toBe('2026-04-28')
    expect(body.fallback_mode).toBe(true)
  })

  it('400 + E-INPUT-INVALID · week_starting not a date', async () => {
    const res = await POST(req({
      client_id: 'acme',
      week_starting: 'last monday', // not ISO date
      title: 'X',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-INVALID · missing client_id', async () => {
    const res = await POST(req({ week_starting: '2026-04-28', title: 'X' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({
      client_id: 'acme', week_starting: '2026-04-28', title: 'X',
    }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('still returns page_id when DB log write fails', async () => {
    insertSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "notion_page_log" does not exist' },
    }))
    const res = await POST(req({
      client_id: 'acme', week_starting: '2026-04-28', title: 'X',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.page_id).toBeTruthy()
    expect(body.persisted_id).toBeNull()
  })
})
