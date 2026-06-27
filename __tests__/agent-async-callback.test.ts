/**
 * Tests · agent-async-callback (SPEC 2026-06-09 · Track N).
 *
 * Validates · URL validation (SSRF defense) · resolveCallbackUrl from
 * multi-source · dispatchAsyncCallback success + failure modes (invalid URL ·
 * non-2xx · timeout · fetch throw) · payload integrity.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  ASYNC_CALLBACK_BACKOFF_MS,
  ASYNC_CALLBACK_MAX_ATTEMPTS,
  ASYNC_CALLBACK_SOURCE_HEADER,
  ASYNC_CALLBACK_TIMEOUT_MS,
  dispatchAsyncCallback,
  resolveCallbackUrl,
  validateCallbackUrl,
  type CallbackAttemptLog,
} from '@/lib/agent-async-callback'

describe('validateCallbackUrl · canon SSRF defense', () => {
  it('accepts https URL', () => {
    expect(validateCallbackUrl('https://n8n.test/resume/abc')?.toString()).toBe(
      'https://n8n.test/resume/abc',
    )
  })
  it('accepts http URL (n8n on private network)', () => {
    expect(validateCallbackUrl('http://n8n.internal:5678/webhook-waiting/x')).not.toBeNull()
  })
  it('rejects empty + non-string', () => {
    expect(validateCallbackUrl('')).toBeNull()
    expect(validateCallbackUrl(undefined)).toBeNull()
    expect(validateCallbackUrl(null)).toBeNull()
    expect(validateCallbackUrl(123)).toBeNull()
  })
  it('rejects non-URL strings', () => {
    expect(validateCallbackUrl('not a url')).toBeNull()
    expect(validateCallbackUrl('://broken')).toBeNull()
  })
  it('rejects non-http(s) protocols · file/data/javascript', () => {
    expect(validateCallbackUrl('file:///etc/passwd')).toBeNull()
    expect(validateCallbackUrl('data:text/plain,foo')).toBeNull()
    expect(validateCallbackUrl('javascript:alert(1)')).toBeNull()
    expect(validateCallbackUrl('ftp://example.com/path')).toBeNull()
  })
})

describe('resolveCallbackUrl · multi-source resolution (top-level + context)', () => {
  it('returns top-level callback_url (snake)', () => {
    expect(resolveCallbackUrl({ callback_url: 'https://a.test' })).toBe('https://a.test')
  })
  it('returns top-level callbackUrl (camel)', () => {
    expect(resolveCallbackUrl({ callbackUrl: 'https://b.test' })).toBe('https://b.test')
  })
  it('falls back to context.callback_url', () => {
    expect(resolveCallbackUrl({ context: { callback_url: 'https://c.test' } })).toBe(
      'https://c.test',
    )
  })
  it('falls back to context.callbackUrl', () => {
    expect(resolveCallbackUrl({ context: { callbackUrl: 'https://d.test' } })).toBe(
      'https://d.test',
    )
  })
  it('returns null when no source provides it', () => {
    expect(resolveCallbackUrl({})).toBeNull()
    expect(resolveCallbackUrl({ context: {} })).toBeNull()
  })
  it('prefers top-level snake over context', () => {
    expect(
      resolveCallbackUrl({
        callback_url: 'https://top.test',
        context: { callback_url: 'https://ctx.test' },
      }),
    ).toBe('https://top.test')
  })
})

describe('dispatchAsyncCallback · success path', () => {
  it('POSTs to URL with JSON body + canon source header · returns ok=true', async () => {
    let capturedUrl: string | URL | undefined
    let capturedInit: RequestInit | undefined
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return new Response('{}', { status: 200 })
    })
    const body = { success: true, agent: 'onboarding-specialist', discovery_output: { x: 1 } }
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/abc',
      body,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.status_code).toBe(200)
    expect(capturedUrl).toBe('https://n8n.test/resume/abc')
    expect(capturedInit?.method).toBe('POST')
    const headers = capturedInit?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers[ASYNC_CALLBACK_SOURCE_HEADER]).toBe('agents-run-sdk')
    expect(JSON.parse(String(capturedInit?.body))).toEqual(body)
  })
})

describe('dispatchAsyncCallback · failure modes', () => {
  it('invalid_url when URL fails validation', async () => {
    const r = await dispatchAsyncCallback({
      callback_url: 'file:///etc/passwd',
      body: {},
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.kind).toBe('invalid_url')
  })

  it('non_2xx when callback URL responds 4xx/5xx (after all retries)', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 503 }))
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async () => {}, // skip real backoff
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('non_2xx')
      expect(r.status_code).toBe(503)
      expect(r.status).toBe('all_retries_failed')
    }
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('fetch_threw when fetch throws non-abort error (after all retries)', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('econnreset')
    })
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async () => {},
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('fetch_threw')
      expect(r.detail).toMatch(/econnreset/)
      expect(r.status).toBe('all_retries_failed')
    }
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('timeout when fetch is aborted by AbortController (after all retries)', async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
      return new Response('unreachable', { status: 200 })
    })
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/slow',
      body: {},
      timeout_ms: 30,
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async () => {},
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('timeout')
      expect(r.detail).toMatch(/30ms/)
      expect(r.status).toBe('all_retries_failed')
    }
  })

  it('default timeout · ASYNC_CALLBACK_TIMEOUT_MS = 10s', () => {
    expect(ASYNC_CALLBACK_TIMEOUT_MS).toBe(10_000)
  })
})

// ─── Track P · resilience (retry + backoff + audit + all_retries_failed) ──

describe('Track P · retry + exponential backoff', () => {
  it('canon defaults · 3 attempts · backoff [2s, 4s]', () => {
    expect(ASYNC_CALLBACK_MAX_ATTEMPTS).toBe(3)
    expect([...ASYNC_CALLBACK_BACKOFF_MS]).toEqual([2_000, 4_000])
  })

  it('retry fires 3 times on persistent failure · backoff timing verified', async () => {
    const fetcher = vi.fn(async () => new Response('down', { status: 500 }))
    const slept: number[] = []
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async (ms) => {
        slept.push(ms)
      },
    })
    // 3 attempts, 2 backoff gaps between them (immediate · 2s · 4s)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(slept).toEqual([2_000, 4_000])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.attempts).toBe(3)
      expect(r.status).toBe('all_retries_failed')
    }
  })

  it('success on attempt 2 · short-circuits remaining retries', async () => {
    let n = 0
    const fetcher = vi.fn(async () => {
      n++
      return n === 1
        ? new Response('temporary', { status: 503 })
        : new Response('{}', { status: 200 })
    })
    const slept: number[] = []
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async (ms) => {
        slept.push(ms)
      },
    })
    expect(fetcher).toHaveBeenCalledTimes(2) // did NOT make a 3rd attempt
    expect(slept).toEqual([2_000]) // only one backoff (before attempt 2)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.attempts).toBe(2)
  })

  it('success on attempt 1 · no backoff, no retry', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const slept: number[] = []
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async (ms) => slept.push(ms) as unknown as void,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(slept).toEqual([])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.attempts).toBe(1)
  })

  it('invalid_url is terminal · no retry · no all_retries_failed tag', async () => {
    const r = await dispatchAsyncCallback({
      callback_url: 'file:///etc/passwd',
      body: {},
      sleep: async () => {},
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('invalid_url')
      expect(r.attempts).toBe(0)
      expect(r.status).toBeUndefined()
    }
  })
})

describe('Track P · per-attempt audit hook (onAttempt)', () => {
  it('emits one log row per attempt with workflow_id + status + http code', async () => {
    const fetcher = vi.fn(async () => new Response('down', { status: 500 }))
    const logs: CallbackAttemptLog[] = []
    await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async () => {},
      workflow_id: 'wf-123',
      onAttempt: (log) => logs.push(log),
    })
    expect(logs).toHaveLength(3)
    expect(logs.map((l) => l.attempt_number)).toEqual([1, 2, 3])
    for (const l of logs) {
      expect(l.workflow_id).toBe('wf-123')
      expect(l.callback_url).toBe('https://n8n.test/resume/x')
      expect(l.status).toBe('non_2xx')
      expect(l.http_status_code).toBe(500)
      expect(l.error_message).toMatch(/500/)
      expect(typeof l.attempted_at).toBe('string')
    }
  })

  it('emits ok log on success · stops after the successful attempt', async () => {
    let n = 0
    const fetcher = vi.fn(async () => {
      n++
      return n < 2 ? new Response('x', { status: 502 }) : new Response('{}', { status: 200 })
    })
    const logs: CallbackAttemptLog[] = []
    await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async () => {},
      onAttempt: (log) => logs.push(log),
    })
    expect(logs).toHaveLength(2)
    expect(logs[0].status).toBe('non_2xx')
    expect(logs[1].status).toBe('ok')
    expect(logs[1].http_status_code).toBe(200)
    expect(logs[1].error_message).toBeNull()
  })

  it('emits invalid_url log even when terminal', async () => {
    const logs: CallbackAttemptLog[] = []
    await dispatchAsyncCallback({
      callback_url: 'file:///etc/passwd',
      body: {},
      onAttempt: (log) => logs.push(log),
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].status).toBe('invalid_url')
    expect(logs[0].attempt_number).toBe(1)
  })

  it('onAttempt that throws never breaks the dispatch', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
      onAttempt: () => {
        throw new Error('logger blew up')
      },
    })
    expect(r.ok).toBe(true)
  })
})
