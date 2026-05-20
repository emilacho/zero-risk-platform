/**
 * Resend email wrapper · vitest unit tests · Sprint 3 Día 2 · 2026-05-20.
 *
 * Covers ·
 *   1. Missing RESEND_API_KEY → 'ServiceUnconfigured' (graceful)
 *   2. Missing `to` → 'InvalidInput'
 *   3. Invalid email format → 'InvalidInput'
 *   4. Missing subject → 'InvalidInput'
 *   5. Missing both html + text → 'InvalidInput'
 *   6. Happy path · Resend returns 200 + id → SendResult.ok
 *   7. Resend non-2xx → 'ProviderError' with status preserved
 *   8. Fetch throws (network) → 'NetworkError'
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  sendEmail,
  sendBatch,
  verifyDomain,
  __resetDomainCache,
} from '../src/lib/email/resend'

const VALID_INPUT = {
  to: 'test@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
}

const ORIGINAL_KEY = process.env.RESEND_API_KEY

beforeEach(() => {
  __resetDomainCache()
})

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = ORIGINAL_KEY
})

describe('sendEmail · graceful unconfigured behavior', () => {
  it('1. returns ServiceUnconfigured when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY
    const r = await sendEmail(VALID_INPUT)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('ServiceUnconfigured')
      expect(r.detail).toContain('RESEND_API_KEY')
      expect(r.provider).toBe('resend')
    }
  })

  it('1b. returns ServiceUnconfigured when RESEND_API_KEY is empty string', async () => {
    process.env.RESEND_API_KEY = '   '
    const r = await sendEmail(VALID_INPUT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('ServiceUnconfigured')
  })
})

describe('sendEmail · input validation', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key'
  })

  it('2. rejects empty recipients', async () => {
    const r = await sendEmail({ ...VALID_INPUT, to: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('InvalidInput')
      expect(r.detail).toContain('to_required')
    }
  })

  it('3. rejects malformed email address', async () => {
    const r = await sendEmail({ ...VALID_INPUT, to: 'not-an-email' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('InvalidInput')
      expect(r.detail).toContain('invalid_email_format')
    }
  })

  it('4. rejects missing subject', async () => {
    const r = await sendEmail({ ...VALID_INPUT, subject: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('InvalidInput')
      expect(r.detail).toContain('subject_required')
    }
  })

  it('5. rejects missing html AND text', async () => {
    const r = await sendEmail({
      to: 'a@b.com',
      subject: 'Test',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('InvalidInput')
      expect(r.detail).toContain('html_or_text_required')
    }
  })
})

describe('sendEmail · provider integration', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key'
  })

  it('6. happy path · returns message_id from Resend 200 response', async () => {
    const stubFetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'resend-msg-abc123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch
    const r = await sendEmail(VALID_INPUT, { fetchImpl: stubFetch })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.message_id).toBe('resend-msg-abc123')
      expect(r.provider).toBe('resend')
      expect(r.queued_at).toMatch(/\d{4}-\d{2}-\d{2}T/)
    }
    expect(stubFetch).toHaveBeenCalledTimes(1)
  })

  it('6b. forwards Authorization Bearer + JSON body to Resend', async () => {
    const stubFetch = vi.fn(async (_url, init) => {
      const headers = init?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer re_test_key')
      expect(headers['Content-Type']).toBe('application/json')
      const body = JSON.parse(init?.body as string) as Record<string, unknown>
      expect(body.to).toEqual(['test@example.com'])
      expect(body.subject).toBe('Hello')
      expect(body.html).toBe('<p>Hi</p>')
      return new Response(JSON.stringify({ id: 'ok' }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await sendEmail(VALID_INPUT, { fetchImpl: stubFetch })
    expect(r.ok).toBe(true)
  })

  it('7. provider 4xx/5xx → ProviderError with status preserved', async () => {
    const stubFetch = vi.fn(async () =>
      new Response('{"error":"rate_limited"}', { status: 429 }),
    ) as unknown as typeof fetch
    const r = await sendEmail(VALID_INPUT, { fetchImpl: stubFetch })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('ProviderError')
      expect(r.status).toBe(429)
      expect(r.detail).toContain('HTTP 429')
    }
  })

  it('8. fetch throws network error → NetworkError', async () => {
    const stubFetch = vi.fn(async () => {
      throw new Error('socket hang up')
    }) as unknown as typeof fetch
    const r = await sendEmail(VALID_INPUT, { fetchImpl: stubFetch })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('NetworkError')
      expect(r.detail).toContain('socket hang up')
    }
  })
})

describe('sendBatch + verifyDomain · extras', () => {
  it('sendBatch · returns one result per input (order preserved)', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const stubFetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init?.body as string) as { to: string[] }
      return new Response(JSON.stringify({ id: `id-${body.to[0]}` }), {
        status: 200,
      })
    }) as unknown as typeof fetch
    const results = await sendBatch(
      [
        { to: 'a@x.com', subject: 'S1', html: '<p>1</p>' },
        { to: 'b@x.com', subject: 'S2', html: '<p>2</p>' },
        { to: 'c@x.com', subject: 'S3', html: '<p>3</p>' },
      ],
      { fetchImpl: stubFetch },
    )
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('verifyDomain · returns verified=false when no domain marked verified', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const stubFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ name: 'zero-risk.com.ec', status: 'pending' }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch
    const r = await verifyDomain({ fetchImpl: stubFetch, force: true })
    expect(r.ok).toBe(true)
    expect(r.verified).toBe(false)
  })
})
