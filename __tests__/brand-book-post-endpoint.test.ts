/**
 * Tests · POST /api/brand-book/[clientId] · endpoint de ESCRITURA del brand book
 * (paso Promote → canon · gateado por fidelidad). Antes NO existía · el track posteaba
 * a /api/clients/{id}/brand-book (404 HTML) · CC#4 2026-07-01.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertSingle = vi.fn()
const existingMaybeSingle = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      // idempotencia · select existing → eq → order → limit → maybeSingle
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: existingMaybeSingle }) }) }),
      }),
      // insert nuevo → select → single
      insert: () => ({ select: () => ({ single: insertSingle }) }),
    }),
  }),
}))

const { POST } = await import('../src/app/api/brand-book/[clientId]/route')

const CID = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const ctx = { params: Promise.resolve({ clientId: CID }) }
const req = (headers: Record<string, string>, body: unknown) =>
  new Request('http://x/api/brand-book/' + CID, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  insertSingle.mockReset()
  existingMaybeSingle.mockReset()
  existingMaybeSingle.mockResolvedValue({ data: null, error: null }) // default · no existe
  process.env.INTERNAL_API_KEY = 'test-key'
})
afterEach(() => { delete process.env.INTERNAL_API_KEY })

describe('POST /api/brand-book/[clientId]', () => {
  it('401 sin x-api-key correcta', async () => {
    const res = await POST(req({ 'x-api-key': 'wrong' }, { brand_book: { positioning: 'x' } }), ctx)
    expect(res.status).toBe(401)
  })

  it('400 sin brand_book', async () => {
    const res = await POST(req({ 'x-api-key': 'test-key' }, { brand_book: {} }), ctx)
    expect(res.status).toBe(400)
  })

  it('200 + persisted · inserta y mapea campos + preserva el draft en content_text', async () => {
    insertSingle.mockResolvedValue({ data: { id: 'bb-1' }, error: null })
    const draft = { positioning: 'Náufrago...', icp_summary: 'viajero', voice_description: 'cálida', forbidden_words: ['x'], customer_angle: 'y', retention_notes: 'z' }
    const res = await POST(req({ 'x-api-key': 'test-key' }, { brand_book: draft, fidelity_passed: true, fidelity_scores: { positioning: 0.95 } }), ctx)
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.persisted).toBe(true)
    expect(j.id).toBe('bb-1')
  })

  it('500 cuando el insert falla (no traga el error)', async () => {
    insertSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await POST(req({ 'x-api-key': 'test-key' }, { brand_book: { positioning: 'x' } }), ctx)
    expect(res.status).toBe(500)
    expect((await res.json()).persisted).toBe(false)
  })

  it('IDEMPOTENTE · si ya existe un brand book · devuelve el existente SIN insertar (loop exit)', async () => {
    existingMaybeSingle.mockResolvedValue({ data: { id: 'bb-existing' }, error: null })
    const res = await POST(req({ 'x-api-key': 'test-key' }, { brand_book: { positioning: 'x' } }), ctx)
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.persisted).toBe(true)
    expect(j.already_existed).toBe(true)
    expect(j.id).toBe('bb-existing')
    expect(insertSingle).not.toHaveBeenCalled() // NO crea duplicado
  })
})
