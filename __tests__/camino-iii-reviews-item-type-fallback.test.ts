/**
 * Tests · POST /api/camino-iii/reviews · hardening item_type (P3 · 2026-06-29).
 *
 * Un item_type inválido/ausente NO debe tumbar el run · cae a 'other' y el valor
 * original queda en metadata.original_item_type. item_id sigue siendo requisito.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: () => ({ ok: true }),
}))

let captured: Record<string, unknown> | null = null
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        captured = row
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'rev-1', ...row }, error: null }),
          }),
        }
      },
    }),
  }),
}))

const { POST } = await import('@/app/api/camino-iii/reviews/route')

function req(body: Record<string, unknown>): Request {
  return new Request('http://test/api/camino-iii/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  captured = null
})

describe('POST /api/camino-iii/reviews · item_type fallback', () => {
  it('item_type inválido → fallback "other" + original_item_type en metadata · 201', async () => {
    const r = await POST(req({ item_type: 'smoke_test', item_id: 'x1', payload: {} }))
    expect(r.status).toBe(201)
    expect(captured!.item_type).toBe('other')
    expect((captured!.metadata as Record<string, unknown>).original_item_type).toBe('smoke_test')
  })

  it('item_type válido se conserva · sin original_item_type', async () => {
    const r = await POST(req({ item_type: 'ad_creative', item_id: 'x2' }))
    expect(r.status).toBe(201)
    expect(captured!.item_type).toBe('ad_creative')
    expect((captured!.metadata as Record<string, unknown>).original_item_type).toBeUndefined()
  })

  it('item_type ausente → "other" (no tumba) · 201', async () => {
    const r = await POST(req({ item_id: 'x3' }))
    expect(r.status).toBe(201)
    expect(captured!.item_type).toBe('other')
    expect((captured!.metadata as Record<string, unknown>).original_item_type).toBe('')
  })

  it('item_id faltante sigue siendo 400 (requisito duro)', async () => {
    const r = await POST(req({ item_type: 'ad_creative' }))
    expect(r.status).toBe(400)
    expect(captured).toBeNull()
  })
})
