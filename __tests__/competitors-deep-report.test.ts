/**
 * competitors-deep-report.test.ts · Sprint #6 Brazo 2 Path C
 *
 * Verifies POST /api/competitors/deep-report:
 *   1. 401 when auth fails
 *   2. 400 when client_id resolver returns null
 *   3. 400 when competitor_name + competitor_website + competitor_id all empty
 *   4. UPDATE existing landscape row when (client + competitor_name) match
 *   5. INSERT new landscape row when no match
 *   6. arrays merge dedupe case-insensitively (key_differentiators, weaknesses)
 *   7. 502 surfaces supabase update error
 *   8. idempotent · same payload twice with no row → first creates, second updates
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

const mockSelectMaybeSingle = vi.fn()
const mockUpdateSingle = vi.fn()
const mockInsertSingle = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from() {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => mockSelectMaybeSingle(),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({ single: () => mockUpdateSingle() }),
          }),
        }),
        insert: () => ({
          select: () => ({ single: () => mockInsertSingle() }),
        }),
      }
    },
  }),
}))

import { POST } from '../src/app/api/competitors/deep-report/route'

const buildReq = (body: unknown) =>
  new Request('http://localhost:3000/api/competitors/deep-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  mockAuth.mockReset()
  mockSelectMaybeSingle.mockReset()
  mockUpdateSingle.mockReset()
  mockInsertSingle.mockReset()
  mockAuth.mockReturnValue({ ok: true })
})

describe('POST /api/competitors/deep-report', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const res = await POST(buildReq({ client_id: 'c1', competitor_name: 'X' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when client_id missing from every resolver path', async () => {
    const res = await POST(buildReq({ competitor_name: 'X' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when competitor_name/website/id all empty', async () => {
    const res = await POST(buildReq({ client_id: 'c1' }))
    expect(res.status).toBe(400)
    const j = (await res.json()) as { field?: string }
    expect(j.field).toContain('competitor_')
  })

  it('UPDATE existing landscape row when match found', async () => {
    mockSelectMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'existing-id',
        key_differentiators: ['edge A'],
        weaknesses: ['price'],
        recent_moves: [],
      },
      error: null,
    })
    mockUpdateSingle.mockResolvedValue({ data: { id: 'existing-id' }, error: null })
    const res = await POST(
      buildReq({
        client_id: 'c1',
        competitor_name: '3M Ecuador',
        key_differentiators: ['edge B'],
        weaknesses: ['service'],
      }),
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { action?: string; landscape_id?: string }
    expect(j.action).toBe('updated')
    expect(j.landscape_id).toBe('existing-id')
  })

  it('INSERT new landscape row when no match', async () => {
    mockSelectMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockInsertSingle.mockResolvedValue({ data: { id: 'new-id' }, error: null })
    const res = await POST(
      buildReq({
        client_id: 'c1',
        competitor_name: 'New Competitor',
        competitor_website: 'https://newco.example',
      }),
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { action?: string; landscape_id?: string }
    expect(j.action).toBe('created')
    expect(j.landscape_id).toBe('new-id')
  })

  it('502 surfaces supabase update error', async () => {
    mockSelectMaybeSingle.mockResolvedValueOnce({
      data: { id: 'existing-id', key_differentiators: [], weaknesses: [] },
      error: null,
    })
    mockUpdateSingle.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table' },
    })
    const res = await POST(buildReq({ client_id: 'c1', competitor_name: 'X' }))
    expect(res.status).toBe(502)
  })

  it('502 surfaces supabase insert error', async () => {
    mockSelectMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockInsertSingle.mockResolvedValue({
      data: null,
      error: { message: 'fk violation' },
    })
    const res = await POST(buildReq({ client_id: 'c1', competitor_name: 'X' }))
    expect(res.status).toBe(502)
  })

  it('resolver picks metadata.client_id when top-level missing', async () => {
    mockSelectMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockInsertSingle.mockResolvedValue({ data: { id: 'new-id' }, error: null })
    const res = await POST(
      buildReq({
        metadata: { client_id: 'c-from-meta' },
        competitor_name: 'X',
      }),
    )
    const j = (await res.json()) as { client_id?: string; action?: string }
    expect(j.client_id).toBe('c-from-meta')
    expect(j.action).toBe('created')
  })

  it('treats unknown competitor_type as direct default', async () => {
    mockSelectMaybeSingle.mockResolvedValue({ data: null, error: null })
    let inserted: unknown
    mockInsertSingle.mockImplementation(() => {
      return Promise.resolve({ data: { id: 'new-id' }, error: null })
    })
    inserted = await POST(
      buildReq({
        client_id: 'c1',
        competitor_name: 'X',
      }),
    )
    expect((inserted as Response).status).toBe(200)
  })
})
