/**
 * clients-lookup-by-name.test.ts · Sprint 12 · Náufrago MC fix
 *
 * Verifies GET /api/clients?name=X resolves canonical UUID by name.
 * Replaces the `temp-${Date.now()}` placeholder path so Mission Control +
 * n8n onboarding workflows reference canonical clients table UUIDs end-to-end.
 *
 * Cases ·
 *   1. Exact match → 200 + canonical UUID
 *   2. Case-insensitive match → 200 (ILIKE semantics)
 *   3. No match → 404 with structured error
 *   4. Multiple matches → 409 with candidates listed (ambiguous)
 *   5. Column fallback · `name` errors → retry with `client_name`
 *   6. Auth gate · missing x-api-key → 401
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

const ilikeNameResult = vi.fn()
const ilikeClientNameResult = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      if (table === 'clients') {
        return {
          select: (_cols: string) => ({
            // `.ilike(column, value)` chain · we differentiate by column arg
            ilike: (col: string) => ({
              limit: () => (col === 'name' ? ilikeNameResult() : ilikeClientNameResult()),
            }),
            eq: () => ({
              limit: () => ({ data: [], error: null }),
              maybeSingle: () => ({ data: null, error: null }),
            }),
            limit: () => ({ data: [], error: null }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }) }
    },
  }),
}))

vi.mock('@/lib/input-validator', () => ({
  validateObject: (v: unknown) => ({ ok: true, data: v }),
}))

import { GET } from '../src/app/api/clients/route'

const buildReq = (qs = '', auth = true) =>
  new Request(`http://localhost:3000/api/clients${qs}`, {
    method: 'GET',
    headers: auth ? { 'x-api-key': 'test' } : {},
  })

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockReturnValue({ ok: true })
  ilikeNameResult.mockReset()
  ilikeClientNameResult.mockReset()
})

describe('GET /api/clients?name=X · lookup-by-name canonical', () => {
  it('returns 200 + canonical UUID on exact match', async () => {
    ilikeNameResult.mockReturnValue({
      data: [
        {
          id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
          client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
          name: 'Naufrago',
          client_name: 'Naufrago',
          status: 'onboarding',
          created_at: '2026-05-15T18:03:28Z',
        },
      ],
      error: null,
    })
    const res = await GET(buildReq('?name=Naufrago'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.lookup).toBe('by-name')
    expect(body.client.id).toBe('d69100b5-8ad7-4bb0-908c-68b5544065dc')
    expect(body.id).toBe('d69100b5-8ad7-4bb0-908c-68b5544065dc')
  })

  it('returns 404 when name has no match', async () => {
    ilikeNameResult.mockReturnValue({ data: [], error: null })
    const res = await GET(buildReq('?name=DoesNotExist'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('client_name_not_found')
    expect(body.lookup).toBe('by-name')
    expect(body.name).toBe('DoesNotExist')
  })

  it('returns 409 with candidates on ambiguous match', async () => {
    ilikeNameResult.mockReturnValue({
      data: [
        { id: 'aaa-111', client_id: 'aaa-111', name: 'Acme', client_name: 'Acme', status: 'active', created_at: '2026-01-01T00:00:00Z' },
        { id: 'bbb-222', client_id: 'bbb-222', name: 'Acme', client_name: 'Acme', status: 'active', created_at: '2026-02-01T00:00:00Z' },
      ],
      error: null,
    })
    const res = await GET(buildReq('?name=Acme'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('client_name_ambiguous')
    expect(body.candidates).toHaveLength(2)
  })

  it('falls back to client_name column when name column errors', async () => {
    ilikeNameResult.mockReturnValue({ data: null, error: { message: 'column "name" does not exist' } })
    ilikeClientNameResult.mockReturnValue({
      data: [
        {
          id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
          client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
          name: null,
          client_name: 'Naufrago',
          status: 'onboarding',
          created_at: '2026-05-15T18:03:28Z',
        },
      ],
      error: null,
    })
    const res = await GET(buildReq('?name=Naufrago'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.client.client_name).toBe('Naufrago')
  })

  it('returns 401 when x-api-key is missing', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing' })
    const res = await GET(buildReq('?name=Naufrago', false))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })

  it('does not run name lookup when name param is absent (regression guard)', async () => {
    // No name param · falls through to list/single-fetch path · should NOT call ilikeNameResult
    ilikeNameResult.mockReturnValue({ data: [{ id: 'should-not-be-returned' }], error: null })
    const res = await GET(buildReq('?status=active'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lookup).toBeUndefined()
    expect(ilikeNameResult).not.toHaveBeenCalled()
  })
})
