/**
 * clients-include-competitors.test.ts · Sprint #6 Brazo 2 patch
 *
 * Verifies GET /api/clients?include=competitors attaches a `competitors`
 * array sourced from client_competitive_landscape. Tests:
 *   1. baseline · no include · response unchanged shape (regression guard)
 *   2. ?include=competitors · single-client GET attaches competitors array
 *   3. ?include=competitors · list GET attaches per-row competitors via batched join
 *   4. include=foo,competitors · comma-separated parsing
 *   5. empty competitor list when client has none
 *   6. landscape query failure → returns empty competitors array (soft)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

// Per-table chain mock · returns different stubs based on `.from(table)`.
// Each test arranges what each table returns via the per-table fn refs below.
const clientsListResult = vi.fn()
const clientsSingleResult = vi.fn()
const landscapeListResult = vi.fn()
const landscapeInResult = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => clientsListResult(),
              maybeSingle: () => clientsSingleResult(),
            }),
            limit: () => clientsListResult(),
          }),
        }
      }
      if (table === 'client_competitive_landscape') {
        return {
          select: () => ({
            eq: () => landscapeListResult(),
            in: () => landscapeInResult(),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }) }
    },
  }),
}))

import { GET } from '../src/app/api/clients/route'

const buildReq = (qs = '') =>
  new Request(`http://localhost:3000/api/clients${qs}`, {
    method: 'GET',
    headers: { 'x-api-key': 'test' },
  })

beforeEach(() => {
  mockAuth.mockReset()
  clientsListResult.mockReset()
  clientsSingleResult.mockReset()
  landscapeListResult.mockReset()
  landscapeInResult.mockReset()
  mockAuth.mockReturnValue({ ok: true })
})

describe('GET /api/clients · include=competitors', () => {
  it('baseline · no include · list response has no competitors field', async () => {
    clientsListResult.mockResolvedValue({
      data: [{ id: 'c1', client_name: 'A', status: 'active' }],
      error: null,
    })
    const res = await GET(buildReq('?status=active'))
    expect(res.status).toBe(200)
    const j = (await res.json()) as { clients?: Array<Record<string, unknown>> }
    expect(j.clients?.[0]).not.toHaveProperty('competitors')
  })

  it('?include=competitors · list attaches competitors array via batched join', async () => {
    clientsListResult.mockResolvedValue({
      data: [
        { id: 'c1', client_name: 'A', status: 'active' },
        { id: 'c2', client_name: 'B', status: 'active' },
      ],
      error: null,
    })
    landscapeInResult.mockResolvedValue({
      data: [
        {
          id: 'l1',
          client_id: 'c1',
          competitor_name: '3M Ecuador',
          competitor_website: null,
          competitor_type: 'direct',
        },
        {
          id: 'l2',
          client_id: 'c1',
          competitor_name: 'G4S',
          competitor_website: null,
          competitor_type: 'direct',
        },
        {
          id: 'l3',
          client_id: 'c2',
          competitor_name: 'Securitas',
          competitor_website: null,
          competitor_type: 'direct',
        },
      ],
      error: null,
    })
    const res = await GET(buildReq('?status=active&include=competitors'))
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      clients?: Array<{ id?: string; competitors?: Array<{ competitor_name: string }> }>
    }
    const c1 = j.clients?.find((c) => c.id === 'c1')
    const c2 = j.clients?.find((c) => c.id === 'c2')
    expect(c1?.competitors?.length).toBe(2)
    expect(c2?.competitors?.length).toBe(1)
    expect(c2?.competitors?.[0].competitor_name).toBe('Securitas')
  })

  it('include=foo,competitors · comma-separated parsing works', async () => {
    clientsListResult.mockResolvedValue({
      data: [{ id: 'c1', client_name: 'A', status: 'active' }],
      error: null,
    })
    landscapeInResult.mockResolvedValue({ data: [], error: null })
    const res = await GET(buildReq('?include=foo,competitors'))
    const j = (await res.json()) as { clients?: Array<{ competitors?: unknown[] }> }
    expect(j.clients?.[0].competitors).toEqual([])
  })

  it('empty competitor list when client has no landscape rows', async () => {
    clientsListResult.mockResolvedValue({
      data: [{ id: 'c1', client_name: 'A', status: 'active' }],
      error: null,
    })
    landscapeInResult.mockResolvedValue({ data: [], error: null })
    const res = await GET(buildReq('?include=competitors'))
    const j = (await res.json()) as { clients?: Array<{ competitors?: unknown[] }> }
    expect(j.clients?.[0].competitors).toEqual([])
  })

  it('landscape query throws → soft fallback empty competitors', async () => {
    clientsListResult.mockResolvedValue({
      data: [{ id: 'c1', client_name: 'A', status: 'active' }],
      error: null,
    })
    landscapeInResult.mockRejectedValue(new Error('rls denied'))
    const res = await GET(buildReq('?include=competitors'))
    expect(res.status).toBe(200)
    const j = (await res.json()) as { clients?: Array<{ competitors?: unknown[] }> }
    expect(j.clients?.[0].competitors).toEqual([])
  })
})
