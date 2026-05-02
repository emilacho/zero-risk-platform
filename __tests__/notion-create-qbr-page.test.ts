/**
 * Integration tests · POST /api/notion/create-qbr-page (W18-T2 · W15-D-22).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'qbr-test-key-1234567890abcdef1234'

const captured: { table?: string; row?: Record<string, unknown> } = {}
const insertResult = vi.fn<() => Promise<{ data: null; error: { message: string } | null }>>(async () => ({
  data: null,
  error: null,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      captured.table = table
      return {
        insert(row: Record<string, unknown>) {
          captured.row = row
          return insertResult()
        },
      }
    },
  }),
}))

import { POST } from '../src/app/api/notion/create-qbr-page/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY
const ORIG_NOTION = process.env.NOTION_API_TOKEN

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  delete process.env.NOTION_API_TOKEN
  captured.table = undefined
  captured.row = undefined
  insertResult.mockClear()
  insertResult.mockImplementation(async () => ({ data: null, error: null }))
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
  if (ORIG_NOTION === undefined) delete process.env.NOTION_API_TOKEN
  else process.env.NOTION_API_TOKEN = ORIG_NOTION
})

function req(body: unknown, withKey = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request('http://localhost/api/notion/create-qbr-page', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/notion/create-qbr-page', () => {
  it('happy path · stub mode (no Notion token) · 200 + page_id + fallback_mode', async () => {
    const res = await POST(req({
      client_id: 'acme',
      quarter: 'Q2 2026',
      summary: 'Strong quarter',
      kpis: [{ name: 'NPS', value: 42, target: 40, status: 'on_track' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.page_id).toMatch(/^stub-qbr-acme-q2-2026/)
    expect(body.page_url).toMatch(/^https:\/\/notion\.so\/stub-qbr-acme-q2-2026/)
    expect(body.fallback_mode).toBe(true)
    expect(body.quarter).toBe('Q2 2026')
    expect(captured.table).toBe('notion_qbr_log')
    expect(captured.row).toMatchObject({ client_id: 'acme', quarter: 'Q2 2026', used_stub: true })
  })

  it('400 + E-INPUT-INVALID · missing required quarter', async () => {
    const res = await POST(req({ client_id: 'acme' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(captured.table).toBeUndefined()
  })

  it('400 + E-INPUT-INVALID · quarter format violation', async () => {
    const res = await POST(req({ client_id: 'acme', quarter: '2026-Q2' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ client_id: 'acme', quarter: 'Q1 2026' }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('audit log DB error · still returns 200 + page_id (workflow not blocked)', async () => {
    insertResult.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "notion_qbr_log" does not exist' },
    }))
    const res = await POST(req({ client_id: 'acme', quarter: 'Q3 2026' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.page_id).toMatch(/^stub-qbr-acme-q3-2026/)
    expect(body.fallback_mode).toBe(true)
  })
})
