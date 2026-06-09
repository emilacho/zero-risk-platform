/**
 * Tests · agent-async-callback (SPEC 2026-06-09 · Track N).
 *
 * Validates · URL validation (SSRF defense) · resolveCallbackUrl from
 * multi-source · dispatchAsyncCallback success + failure modes (invalid URL ·
 * non-2xx · timeout · fetch throw) · payload integrity.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  ASYNC_CALLBACK_SOURCE_HEADER,
  ASYNC_CALLBACK_TIMEOUT_MS,
  dispatchAsyncCallback,
  resolveCallbackUrl,
  validateCallbackUrl,
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

  it('non_2xx when callback URL responds 4xx/5xx', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 503 }))
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('non_2xx')
      expect(r.status_code).toBe(503)
    }
  })

  it('fetch_threw when fetch throws non-abort error', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('econnreset')
    })
    const r = await dispatchAsyncCallback({
      callback_url: 'https://n8n.test/resume/x',
      body: {},
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('fetch_threw')
      expect(r.detail).toMatch(/econnreset/)
    }
  })

  it('timeout when fetch is aborted by AbortController', async () => {
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
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('timeout')
      expect(r.detail).toMatch(/30ms/)
    }
  })

  it('default timeout · ASYNC_CALLBACK_TIMEOUT_MS = 10s', () => {
    expect(ASYNC_CALLBACK_TIMEOUT_MS).toBe(10_000)
  })
})
