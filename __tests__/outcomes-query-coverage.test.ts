/**
 * Coverage gap-fill · POST /api/outcomes/query (W17-T2/T3).
 *
 * Base test covers happy/auth/invalid/limit-validation. This file targets
 * the W17-T1 baseline gaps:
 *
 *  - Line 69: invalid-JSON body → 400 E-INPUT-PARSE.
 *  - Lines 105-108: catch branch (supabase throws → fallback_mode=true).
 *  - Plus optional-filter combinations (campaign_id metadata jsonpath, until ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

let chainState: {
  result: { data: unknown; error: unknown } | null
  throws: boolean
} = { result: { data: [], error: null }, throws: false }

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      // Build a thenable chain that supports any number of .eq/.gte/.lte/.order/.range calls
      const chain: Record<string, unknown> & PromiseLike<unknown> = {} as never
      const respond = () => {
        if (chainState.throws) throw new Error('mock: outcomes throw')
        return Promise.resolve(chainState.result)
      }
      chain.select = () => chain
      chain.eq = () => chain
      chain.gte = () => chain
      chain.lte = () => chain
      chain.order = () => chain
      chain.range = () => chain
      // PromiseLike interface
      ;(chain as { then: (...a: unknown[]) => unknown }).then = (
        onfulfilled?: (v: unknown) => unknown,
        onrejected?: (e: unknown) => unknown,
      ) => respond().then(onfulfilled, onrejected)
      return chain
    },
  }),
}))

import { POST } from '../src/app/api/outcomes/query/route'

const VALID_KEY = 'gap-fill-outcomes-query-key'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  chainState = { result: { data: [], error: null }, throws: false }
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(body: string | object, withKey = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request('http://localhost/api/outcomes/query', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/outcomes/query · gap-fill (W17-T2/T3)', () => {
  it('invalid-JSON body · 400 + E-INPUT-PARSE', async () => {
    const res = await POST(req('not json {{{'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('E-INPUT-PARSE')
  })

  it('catch branch · supabase throws → 200 + fallback_mode=true', async () => {
    chainState.throws = true
    const res = await POST(req({ since_days: 7 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.count).toBe(0)
  })

  it('error result (not throw) · also flips fallback_mode without populating rows', async () => {
    chainState.result = { data: null, error: { message: 'rls denied' } }
    const res = await POST(req({}))
    const body = await res.json()
    expect(body.fallback_mode).toBe(true)
    expect(body.count).toBe(0)
  })

  it('all optional filters present · query still returns happy path', async () => {
    chainState.result = {
      data: [
        { id: 'oc-1', agent_slug: 'content-creator', task_id: 't-1', request_id: 'r-1', client_id: 'acme', outcome: 'success', tokens_used: 1234, latency_ms: 800, success: true, model: 'sonnet', cost_usd: 0.04, created_at: '2026-04-30T00:00:00Z', metadata: { campaign_id: 'c-1' } },
      ],
      error: null,
    }
    const res = await POST(req({
      client_id: 'acme',
      agent_slug: 'content-creator',
      outcome_type: 'success',
      campaign_id: 'c-1',
      since_days: 14,
      until: '2026-05-02T00:00:00Z',
      limit: 10,
      offset: 0,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(1)
    expect(body.fallback_mode).toBeUndefined()
    expect(body.rows[0].id).toBe('oc-1')
  })

  it('default limit/offset apply when omitted (50 / 0) · response still well-formed', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.limit).toBe(50)
    expect(body.offset).toBe(0)
  })
})
