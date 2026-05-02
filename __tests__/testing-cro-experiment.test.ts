/**
 * Integration tests · POST /api/testing/cro-experiment (W18-T1 · W15-D-29).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'cro-exp-test-key-1234567890abcdef'

const captured: { table?: string; row?: Record<string, unknown> } = {}
const insertSingle = vi.fn<() => Promise<{ data: { id: string } | null; error: { message: string } | null }>>(async () => ({
  data: { id: 'cro-00000000-0000-0000-0000-000000000029' },
  error: null,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      captured.table = table
      return {
        insert(row: Record<string, unknown>) {
          captured.row = row
          return { select: () => ({ single: insertSingle }) }
        },
      }
    },
  }),
}))

import { POST } from '../src/app/api/testing/cro-experiment/route'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  captured.table = undefined
  captured.row = undefined
  insertSingle.mockClear()
  insertSingle.mockImplementation(async () => ({
    data: { id: 'cro-00000000-0000-0000-0000-000000000029' },
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
  return new Request('http://localhost/api/testing/cro-experiment', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/testing/cro-experiment', () => {
  it('happy path · persists experiment + returns 200 + persisted_id', async () => {
    const res = await POST(req({
      client_id: 'acme',
      experiment_name: 'Hero CTA copy test',
      hypothesis: 'Moving CTA above the fold lifts CR by 8%',
      variants: [
        { name: 'control', url: 'https://acme.com/lp/v1', traffic_allocation: 0.5 },
        { name: 'variant', url: 'https://acme.com/lp/v2', traffic_allocation: 0.5 },
      ],
      primary_metric: 'conversion_rate',
      confidence_level: 0.95,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.persisted_id).toBe('cro-00000000-0000-0000-0000-000000000029')
    expect(body.status).toBe('queued')
    expect(captured.table).toBe('cro_experiments')
    expect(captured.row).toMatchObject({ client_id: 'acme', experiment_name: 'Hero CTA copy test' })
  })

  it('400 + E-INPUT-INVALID · missing required hypothesis', async () => {
    const res = await POST(req({
      client_id: 'acme',
      experiment_name: 'Test',
      variants: [
        { name: 'a', url: 'https://x.com' },
        { name: 'b', url: 'https://y.com' },
      ],
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('400 + E-INPUT-INVALID · only 1 variant (minItems=2)', async () => {
    const res = await POST(req({
      client_id: 'acme',
      experiment_name: 'Test',
      hypothesis: 'X',
      variants: [{ name: 'only', url: 'https://x.com' }],
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({
      client_id: 'acme',
      experiment_name: 'X',
      hypothesis: 'Y',
      variants: [
        { name: 'a', url: 'https://x.com' },
        { name: 'b', url: 'https://y.com' },
      ],
    }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('graceful fallback · DB error → 200 + fallback_mode', async () => {
    insertSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'relation "cro_experiments" does not exist' },
    }))
    const res = await POST(req({
      client_id: 'acme',
      experiment_name: 'X',
      hypothesis: 'Y',
      variants: [
        { name: 'a', url: 'https://x.com' },
        { name: 'b', url: 'https://y.com' },
      ],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.fallback_mode).toBe(true)
    expect(body.persisted_id).toBeNull()
  })
})
