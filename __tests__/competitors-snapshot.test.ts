/**
 * competitors-snapshot.test.ts · Sprint #6 Brazo 2 Path B
 *
 * Verifies POST /api/competitors/snapshot:
 *   1. 401 when internal auth fails
 *   2. 400 when client_id resolver finds nothing
 *   3. 400 when competitor_name missing
 *   4. 200 happy path · canonical body shape · resolver direct path
 *   5. resolver fallback paths · metadata.client_id and extra.client_id
 *   6. snapshot_date defaults to today UTC when omitted or malformed
 *   7. 502 when Supabase upsert errors
 *   8. action='inserted' on fresh row · action='updated' on retry same day
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

const mockUpsert = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from() {
      return {
        upsert: () => ({
          select: () => ({
            single: () => mockUpsert(),
          }),
        }),
      }
    },
  }),
}))

import { POST } from '../src/app/api/competitors/snapshot/route'

const buildReq = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost:3000/api/competitors/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(() => {
  mockAuth.mockReset()
  mockUpsert.mockReset()
  mockAuth.mockReturnValue({ ok: true })
})

describe('POST /api/competitors/snapshot', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const res = await POST(buildReq({ client_id: 'c1', competitor_name: 'X' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when client_id absent on every resolver path', async () => {
    const res = await POST(buildReq({ competitor_name: 'X' }))
    expect(res.status).toBe(400)
    const j = (await res.json()) as { field?: string }
    expect(j.field).toBe('client_id')
  })

  it('returns 400 when competitor_name missing', async () => {
    const res = await POST(buildReq({ client_id: 'c1' }))
    expect(res.status).toBe(400)
    const j = (await res.json()) as { field?: string }
    expect(j.field).toBe('competitor_name')
  })

  it('happy path · returns 200 with snapshot_id and action=inserted', async () => {
    mockUpsert.mockResolvedValue({
      data: { id: 'snap-uuid', created_at: new Date().toISOString() },
      error: null,
    })
    const res = await POST(
      buildReq({
        client_id: 'c-pilot',
        competitor_name: '3M Ecuador',
        competitor_website: 'https://www.3m.com.ec',
        meta_ads_data: { ads_count: 12 },
      }),
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { snapshot_id?: string; action?: string }
    expect(j.snapshot_id).toBe('snap-uuid')
    expect(j.action).toBe('inserted')
  })

  it('resolver picks metadata.client_id when top-level missing', async () => {
    mockUpsert.mockResolvedValue({
      data: { id: 's2', created_at: new Date().toISOString() },
      error: null,
    })
    const res = await POST(
      buildReq({
        metadata: { client_id: 'c-from-meta' },
        competitor_name: 'X',
      }),
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { client_id?: string }
    expect(j.client_id).toBe('c-from-meta')
  })

  it('resolver picks extra.client_id as last fallback', async () => {
    mockUpsert.mockResolvedValue({
      data: { id: 's3', created_at: new Date().toISOString() },
      error: null,
    })
    const res = await POST(
      buildReq({ extra: { client_id: 'c-from-extra' }, competitor_name: 'X' }),
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { client_id?: string }
    expect(j.client_id).toBe('c-from-extra')
  })

  it('snapshot_date defaults to today UTC when omitted', async () => {
    mockUpsert.mockResolvedValue({
      data: { id: 's4', created_at: new Date().toISOString() },
      error: null,
    })
    const res = await POST(
      buildReq({ client_id: 'c1', competitor_name: 'X' }),
    )
    const j = (await res.json()) as { snapshot_date?: string }
    expect(j.snapshot_date).toBe(new Date().toISOString().slice(0, 10))
  })

  it('snapshot_date defaults when malformed (non YYYY-MM-DD)', async () => {
    mockUpsert.mockResolvedValue({
      data: { id: 's5', created_at: new Date().toISOString() },
      error: null,
    })
    const res = await POST(
      buildReq({
        client_id: 'c1',
        competitor_name: 'X',
        snapshot_date: 'not-a-date',
      }),
    )
    const j = (await res.json()) as { snapshot_date?: string }
    expect(j.snapshot_date).toBe(new Date().toISOString().slice(0, 10))
  })

  it('returns 502 when supabase upsert errors', async () => {
    mockUpsert.mockResolvedValue({
      data: null,
      error: { message: 'unique violation' },
    })
    const res = await POST(
      buildReq({ client_id: 'c1', competitor_name: 'X' }),
    )
    expect(res.status).toBe(502)
    const j = (await res.json()) as { error?: string; detail?: string }
    expect(j.error).toBe('snapshot_persist_failed')
    expect(j.detail).toContain('unique violation')
  })

  it('action=updated when created_at is older than 2s (retry within same day)', async () => {
    const oldIso = new Date(Date.now() - 10_000).toISOString()
    mockUpsert.mockResolvedValue({
      data: { id: 's6', created_at: oldIso },
      error: null,
    })
    const res = await POST(
      buildReq({ client_id: 'c1', competitor_name: 'X' }),
    )
    const j = (await res.json()) as { action?: string }
    expect(j.action).toBe('updated')
  })
})
