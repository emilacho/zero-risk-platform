/**
 * Integration tests · POST /api/ghl/send-email (W16-T1 · W15-D-14).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      insert: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
    }),
  })),
}))

import { POST } from '../src/app/api/ghl/send-email/route'

const VALID_KEY = 'send-email-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function postReq(body: unknown, authed = true): Request {
  return new Request('http://localhost/api/ghl/send-email', {
    method: 'POST',
    headers: authed
      ? { 'Content-Type': 'application/json', 'x-api-key': VALID_KEY }
      : { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/ghl/send-email', () => {
  it('401 when x-api-key missing', async () => {
    const res = await POST(postReq({ to_email: 'a@b.com', subject: 'hi', body: 'msg' }, false))
    expect(res.status).toBe(401)
  })

  it('400 + E-INPUT-INVALID when to_email is not an email', async () => {
    const res = await POST(postReq({ to_email: 'not-an-email', subject: 'hi', body: 'msg' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-INVALID when subject missing', async () => {
    const res = await POST(postReq({ to_email: 'a@b.com', body: 'msg' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-PARSE on malformed JSON body', async () => {
    const res = await POST(postReq('not json {{{'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-PARSE')
  })

  it('200 happy path returns message_id + fallback_mode + queued_at', async () => {
    const res = await POST(postReq({
      to_email: 'champion@acme.com',
      subject: 'Monthly NPS pulse',
      body: '<p>How likely are you to recommend us?</p>',
      client_id: 'acme',
      template_id: 'tpl-nps-001',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.to_email).toBe('champion@acme.com')
    expect(body.subject).toBe('Monthly NPS pulse')
    expect(body.message_id).toMatch(/^ghl-msg-\d+/)
    expect(body.fallback_mode).toBe(true)
    expect(body.persisted).toBe(false) // mocked DB returns error → not persisted
    expect(typeof body.queued_at).toBe('string')
  })
})
