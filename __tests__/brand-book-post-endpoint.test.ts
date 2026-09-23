/**
 * Tests · POST /api/brand-book/[clientId] · endpoint de ESCRITURA del brand book
 * (paso Promote → canon · gateado por fidelidad). Antes NO existía · el track posteaba
 * a /api/clients/{id}/brand-book (404 HTML) · CC#4 2026-07-01.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertSingle = vi.fn()
const existingMaybeSingle = vi.fn()
let insertado: Record<string, unknown> | null = null
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      // E111 · la versión previa · select id,version → eq → order(version desc) → limit → maybeSingle
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: existingMaybeSingle }) }) }),
      }),
      // insert nuevo → select → single
      insert: (row: Record<string, unknown>) => { insertado = row; return { select: () => ({ single: insertSingle }) } },
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

  // ── E111 (CC#1 · 2026-09-23 · decisión de Emilio) · EL MANUAL SE VERSIONA ──
  // Antes esta puerta era idempotente por cliente (`already_existed` · sin insertar). En E110
  // (cimiento 146732) el manual nuevo que pasó la vara con 0,935 nunca llegó a la base y el PDF
  // y la planeación leyeron el viejo. Ahora: versión nueva = max(version) + 1 · ésa queda vigente.
  it('E111 · primer manual del cliente · version 1 · previous_id null', async () => {
    insertSingle.mockResolvedValue({ data: { id: 'bb-1', gate_outcome: 'paso_la_vara' }, error: null })
    const res = await POST(req({ 'x-api-key': 'test-key' }, { brand_book: { positioning: 'x' }, gate_outcome: 'paso_la_vara' }), ctx)
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j).toMatchObject({ persisted: true, id: 'bb-1', version: 1, previous_id: null })
    expect(j.already_existed).toBeUndefined()
    expect((insertado as Record<string, unknown>).version).toBe(1)
  })

  it('E111 · ya existe v1 (el manual viejo de E107) · el nuevo se INSERTA como v2 y queda vigente · la v1 se conserva', async () => {
    existingMaybeSingle.mockResolvedValue({ data: { id: 'a9eead20', version: 1 }, error: null })
    insertSingle.mockResolvedValue({ data: { id: 'bb-nueva', gate_outcome: 'paso_la_vara' }, error: null })
    const res = await POST(req({ 'x-api-key': 'test-key' }, { brand_book: { positioning: 'El mar, directo a tu almuerzo' }, gate_outcome: 'paso_la_vara' }), ctx)
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j).toMatchObject({ persisted: true, id: 'bb-nueva', version: 2, previous_id: 'a9eead20', gate_outcome: 'paso_la_vara' })
    expect(j.already_existed).toBeUndefined()
    expect(insertSingle).toHaveBeenCalledTimes(1)
    const row = insertado as Record<string, unknown>
    expect(row.version).toBe(2)
    expect(row.client_id).toBe(CID)
    expect(row.positioning).toBe('El mar, directo a tu almuerzo')
  })

  it('E111 · v7 existente → v8 (no se pisa ninguna) · y si falla la búsqueda de la previa → 500 sin insertar', async () => {
    existingMaybeSingle.mockResolvedValue({ data: { id: 'bb-7', version: 7 }, error: null })
    insertSingle.mockResolvedValue({ data: { id: 'bb-8' }, error: null })
    const ok = await POST(req({ 'x-api-key': 'test-key' }, { brand_book: { positioning: 'x' } }), ctx)
    expect((await ok.json()).version).toBe(8)
    expect((insertado as Record<string, unknown>).version).toBe(8)

    insertSingle.mockClear()
    existingMaybeSingle.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    const res = await POST(req({ 'x-api-key': 'test-key' }, { brand_book: { positioning: 'x' } }), ctx)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ persisted: false, error: 'previous_lookup_failed' })
    expect(insertSingle).not.toHaveBeenCalled()
  })
})
