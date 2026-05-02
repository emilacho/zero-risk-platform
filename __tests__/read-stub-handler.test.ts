/**
 * Unit tests for src/lib/read-stub-handler.ts (Wave 14 · CC#1).
 *
 * Validates the GET/POST mock-data helper used by 20+ analytics stub routes
 * during smoke tests. Critical guarantees:
 *   1. requireAuth defaults to true (401 without key)
 *   2. requireAuth:false bypasses auth (public stubs)
 *   3. body echo + makeResponse merge correctly
 *   4. handler errors don't propagate — caller always gets 200 + fallback_mode
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { handleReadStub } from '../src/lib/read-stub-handler'

const ORIG_KEY = process.env.INTERNAL_API_KEY
const VALID_KEY = 'unit-test-internal-key-1234567890abcdef'

beforeEach(() => {
  process.env.INTERNAL_API_KEY = VALID_KEY
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function getReq(url = 'http://localhost/test', authed = true): Request {
  return new Request(url, {
    method: 'GET',
    headers: authed ? { 'x-api-key': VALID_KEY } : {},
  })
}

function postReq(body: unknown, authed = true): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: authed
      ? { 'Content-Type': 'application/json', 'x-api-key': VALID_KEY }
      : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('handleReadStub · auth gate', () => {
  it('returns 401 when requireAuth defaults to true and key missing', async () => {
    const res = await handleReadStub(getReq('http://localhost/test', false), {
      name: 'test',
      makeResponse: () => ({ rows: [] }),
    })
    expect(res.status).toBe(401)
  })

  it('skips auth check when requireAuth: false', async () => {
    const res = await handleReadStub(getReq('http://localhost/test', false), {
      name: 'test',
      makeResponse: () => ({ rows: [] }),
      requireAuth: false,
    })
    expect(res.status).toBe(200)
  })
})

describe('handleReadStub · response shape', () => {
  it('GET request: query params become body for makeResponse + echoed back', async () => {
    const res = await handleReadStub(getReq('http://localhost/test?client_id=acme&limit=10'), {
      name: 'metrics',
      makeResponse: (body) => ({ count: 42, echoed_client: body.client_id }),
    })
    const data = await res.json()
    expect(data.client_id).toBe('acme')
    expect(data.limit).toBe('10')
    expect(data.count).toBe(42)
    expect(data.echoed_client).toBe('acme')
    expect(data.ok).toBe(true)
    expect(data.stub_name).toBe('metrics')
    expect(data.fallback_mode).toBe(true)
  })

  it('POST request: JSON body becomes body for makeResponse + echoed back', async () => {
    const res = await handleReadStub(postReq({ client_id: 'acme', task: 't' }), {
      name: 'lookup',
      makeResponse: (body) => ({ matched: true, client: body.client_id }),
    })
    const data = await res.json()
    expect(data.client_id).toBe('acme')
    expect(data.task).toBe('t')
    expect(data.matched).toBe(true)
    expect(data.client).toBe('acme')
  })

  it('POST with non-object body falls back to {}', async () => {
    const res = await handleReadStub(postReq([1, 2, 3]), {
      name: 'list',
      makeResponse: () => ({ rows: [] }),
    })
    expect(res.status).toBe(200)
  })

  it('POST with invalid JSON does not throw — handler still 200', async () => {
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': VALID_KEY },
      body: 'not json {{{',
    })
    const res = await handleReadStub(req, {
      name: 'list',
      makeResponse: () => ({ rows: [] }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })
})

describe('handleReadStub · error path', () => {
  it('captures makeResponse throws as handler_error in 200 response', async () => {
    const res = await handleReadStub(getReq(), {
      name: 'crashy',
      makeResponse: () => {
        throw new Error('boom')
      },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.fallback_mode).toBe(true)
    expect(data.handler_error).toBe('boom')
  })

  it('non-Error throws are stringified', async () => {
    const res = await handleReadStub(getReq(), {
      name: 'crashy',
      makeResponse: () => {
        throw 'string-error-not-Error-instance'
      },
    })
    const data = await res.json()
    expect(data.handler_error).toBe('string-error-not-Error-instance')
  })
})
