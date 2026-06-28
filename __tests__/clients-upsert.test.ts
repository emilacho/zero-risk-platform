/**
 * clients-upsert.test.ts · LOTE-C diagnostic #4 (Supabase persistence)
 *
 * Verifies POST /api/clients/upsert correctly:
 *   1. enforces internal-key auth (401 before validation)
 *   2. rejects missing `name` field (Zod-equivalent · Ajv 400)
 *   3. happy path · 3 writes land · response shape stable
 *   4. partial-success when client_brand_books or client_journey_state inserts fail
 *   5. slugify derives URL-safe identifier from arbitrary names
 *   6. supabase init failure → 502 (no crash)
 *
 * No real DB calls · all Supabase methods mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────
const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (request: Request) => mockAuth(request),
}))

const mockClientsUpsert = vi.fn()
const mockClientsSelectBySlug = vi.fn()
const mockClientsPreSelect = vi.fn() // BUG11 · pre-check maybeSingle (existe el slug?)
const mockBrandBooksInsert = vi.fn()
const mockJourneyInsert = vi.fn()
const mockGetSupabaseAdmin = vi.fn()
let capturedClientRow: Record<string, unknown> | null = null

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}))

// Build a Supabase chain-mock that maps table name → behaviour stub.
function buildSupabaseMock() {
  return {
    from(table: string) {
      if (table === 'clients') {
        return {
          upsert: (row: Record<string, unknown>) => {
            capturedClientRow = row
            return {
              select: () => ({
                single: () => mockClientsUpsert(),
              }),
            }
          },
          // select().eq() → .single() = fallback idempotente · .maybeSingle() =
          // BUG11 pre-check (¿existe ya el slug? · para decidir si fijar el id).
          select: () => ({
            eq: () => ({
              single: () => mockClientsSelectBySlug(),
              maybeSingle: () => mockClientsPreSelect(),
            }),
          }),
        }
      }
      if (table === 'client_brand_books') {
        return {
          insert: () => ({
            select: () => ({
              single: () => mockBrandBooksInsert(),
            }),
          }),
        }
      }
      if (table === 'client_journey_state') {
        return {
          insert: () => ({
            select: () => ({
              single: () => mockJourneyInsert(),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

// Import AFTER mocks are registered
import { POST, slugify } from '../src/app/api/clients/upsert/route'

const buildReq = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Request('http://localhost:3000/api/clients/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'k', ...headers },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  mockAuth.mockReset().mockReturnValue({ ok: true })
  mockClientsUpsert.mockReset()
  mockClientsSelectBySlug.mockReset().mockResolvedValue({ data: null, error: null })
  mockClientsPreSelect.mockReset().mockResolvedValue({ data: null, error: null }) // default · slug nuevo
  capturedClientRow = null
  mockBrandBooksInsert.mockReset()
  mockJourneyInsert.mockReset()
  mockGetSupabaseAdmin.mockReset().mockReturnValue(buildSupabaseMock())
})

describe('slugify helper', () => {
  it('lowercases + replaces non-alphanumerics with hyphens', () => {
    expect(slugify('Zero Risk Ec. Seg. Ind.')).toBe('zero-risk-ec-seg-ind')
  })
  it('strips diacritics', () => {
    expect(slugify('Pérez & Compañía')).toBe('perez-compania')
  })
  it('trims leading/trailing hyphens', () => {
    expect(slugify('   Spaced Out   ')).toBe('spaced-out')
  })
  it('falls back to "client" for empty/symbolic input', () => {
    expect(slugify('!!!')).toBe('client')
  })
  it('caps slug at 100 chars', () => {
    const long = 'a'.repeat(300)
    expect(slugify(long).length).toBeLessThanOrEqual(100)
  })
})

describe('POST /api/clients/upsert · auth + validation', () => {
  it('returns 401 when internal-key auth fails (before validation runs)', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'Missing x-api-key header' })
    const r = await POST(buildReq({ name: 'X' }, { 'x-api-key': '' }))
    expect(r.status).toBe(401)
    const j = await r.json()
    expect(j.error).toBe('unauthorized')
    expect(mockClientsUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 when name is missing', async () => {
    const r = await POST(buildReq({ industry: 'x' }))
    expect(r.status).toBe(400)
    expect(mockClientsUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 when name is empty string', async () => {
    const r = await POST(buildReq({ name: '' }))
    expect(r.status).toBe(400)
  })
})

describe('POST /api/clients/upsert · happy path', () => {
  it('writes to all 3 tables when brand_book is provided', async () => {
    mockClientsUpsert.mockResolvedValue({
      data: { id: 'client-uuid-1', name: 'Acme', slug: 'acme', status: 'onboarding', industry: 'tech', website_url: 'https://acme.io', created_at: '2026-05-15T00:00:00Z', updated_at: '2026-05-15T00:00:00Z' },
      error: null,
    })
    mockBrandBooksInsert.mockResolvedValue({ data: { id: 'bb-uuid-1' }, error: null })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js-uuid-1', journey: 'ONBOARD', status: 'active', started_at: '2026-05-15T00:00:00Z' }, error: null })

    const r = await POST(buildReq({
      name: 'Acme',
      website: 'https://acme.io',
      industry: 'tech',
      brand_book: { tagline: 'Just do it', voice_description: 'bold' },
      journey: 'ONBOARD',
      trigger_source: 'unit_test',
    }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.client_id).toBe('client-uuid-1')
    expect(j.brand_book_id).toBe('bb-uuid-1')
    expect(j.journey_state_id).toBe('js-uuid-1')
    expect(j.writes).toEqual({
      clients: true,
      client_brand_books: true,
      client_journey_state: true,
    })
    expect(j.client.slug).toBe('acme')
  })

  it('skips brand_book insert when payload omits it', async () => {
    mockClientsUpsert.mockResolvedValue({
      data: { id: 'client-uuid-2', name: 'Beta', slug: 'beta', status: 'onboarding' },
      error: null,
    })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js-uuid-2' }, error: null })

    const r = await POST(buildReq({ name: 'Beta' }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.brand_book_id).toBeNull()
    expect(j.writes.client_brand_books).toBe(false)
    expect(j.writes.clients).toBe(true)
    expect(j.writes.client_journey_state).toBe(true)
    expect(mockBrandBooksInsert).not.toHaveBeenCalled()
  })

  it('derives slug from name when slug not provided', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({
      data: { id: 'c3', name: 'Zero Risk Ec.', slug: 'zero-risk-ec', status: 'onboarding' },
      error: null,
    })
    mockClientsUpsert.mockImplementation(upsertSpy)
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js3' }, error: null })

    const r = await POST(buildReq({ name: 'Zero Risk Ec.' }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.client.slug).toBe('zero-risk-ec')
  })
})

describe('POST /api/clients/upsert · BUG11 · respetar client_id del payload', () => {
  it('cliente NUEVO (slug no existe) · usa el client_id provisto en el INSERT', async () => {
    mockClientsPreSelect.mockResolvedValue({ data: null, error: null }) // slug nuevo
    mockClientsUpsert.mockResolvedValue({
      data: { id: 'provided-cid-123', name: 'Náufrago', slug: 'naufrago', status: 'onboarding' },
      error: null,
    })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js-n' }, error: null })

    const PROVIDED = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
    const r = await POST(buildReq({ name: 'Náufrago', client_id: PROVIDED }))
    expect(r.status).toBe(200)
    // el row del upsert lleva el id provisto → la fila clients nace con ESE id
    expect(capturedClientRow?.id).toBe(PROVIDED)
  })

  it('cliente EXISTENTE (mismo slug) · NO setea id · conserva el PK (re-onboard idempotente)', async () => {
    mockClientsPreSelect.mockResolvedValue({ data: { id: 'existing-cid' }, error: null })
    mockClientsUpsert.mockResolvedValue({
      data: { id: 'existing-cid', name: 'Náufrago', slug: 'naufrago', status: 'onboarding' },
      error: null,
    })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js-n2' }, error: null })

    // el worker manda un client_id NUEVO en re-onboard · NO debe cambiar el PK
    const r = await POST(buildReq({ name: 'Náufrago', client_id: '11111111-1111-4111-8111-111111111111' }))
    expect(r.status).toBe(200)
    expect(capturedClientRow?.id).toBeUndefined() // no se fuerza id → on_conflict=slug hace UPDATE conservando PK
  })

  it('sin client_id en el payload · no setea id (comportamiento previo · gen_random_uuid de la DB)', async () => {
    mockClientsUpsert.mockResolvedValue({
      data: { id: 'db-generated', name: 'NoId', slug: 'noid', status: 'onboarding' },
      error: null,
    })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js-x' }, error: null })

    const r = await POST(buildReq({ name: 'NoId' }))
    expect(r.status).toBe(200)
    expect(capturedClientRow?.id).toBeUndefined()
  })
})

describe('POST /api/clients/upsert · partial-success', () => {
  it('returns success with brand_book_error when book insert fails but client+journey land', async () => {
    mockClientsUpsert.mockResolvedValue({
      data: { id: 'cid-4', name: 'D', slug: 'd', status: 'onboarding' },
      error: null,
    })
    mockBrandBooksInsert.mockResolvedValue({ data: null, error: { message: 'check constraint violated: forbidden_words must be jsonb' } })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js4' }, error: null })

    const r = await POST(buildReq({
      name: 'D',
      brand_book: { tagline: 'bad' },
    }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.writes.clients).toBe(true)
    expect(j.writes.client_brand_books).toBe(false)
    expect(j.writes.client_journey_state).toBe(true)
    expect(j.brand_book_error).toContain('check constraint')
  })

  it('returns success with journey_state_error when journey insert fails but client lands', async () => {
    mockClientsUpsert.mockResolvedValue({
      data: { id: 'cid-5', name: 'E', slug: 'e', status: 'onboarding' },
      error: null,
    })
    mockJourneyInsert.mockResolvedValue({ data: null, error: { message: 'invalid input value for enum journey_type' } })

    const r = await POST(buildReq({ name: 'E' }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.client_id).toBe('cid-5')
    expect(j.journey_state_id).toBeNull()
    expect(j.writes.client_journey_state).toBe(false)
    expect(j.journey_state_error).toContain('invalid input value')
  })
})

describe('POST /api/clients/upsert · failure paths', () => {
  it('returns 502 when getSupabaseAdmin throws', async () => {
    mockGetSupabaseAdmin.mockImplementation(() => {
      throw new Error('Supabase admin not configured')
    })
    const r = await POST(buildReq({ name: 'X' }))
    expect(r.status).toBe(502)
    const j = await r.json()
    expect(j.error).toBe('supabase_unavailable')
    expect(j.detail).toContain('Supabase admin')
  })

  it('dup-key de slug → fallback idempotente · recupera cliente existente · 200 (no 502)', async () => {
    // El upsert (on_conflict=slug) choca por dup-key residual → fallback fetch-by-slug.
    mockClientsUpsert.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "clients_slug_key"' },
    })
    mockClientsSelectBySlug.mockResolvedValue({
      data: { id: 'existing-cid', name: 'X', slug: 'existing', status: 'onboarding' },
      error: null,
    })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js-x' }, error: null })

    const r = await POST(buildReq({ name: 'X', slug: 'existing' }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.client_id).toBe('existing-cid') // re-onboarding idempotente
  })

  it('returns 502 cuando el error NO es dup-key y agota reintentos', async () => {
    mockClientsUpsert.mockResolvedValue({
      data: null,
      error: { message: 'connection terminated unexpectedly' },
    })
    const r = await POST(buildReq({ name: 'X' }))
    expect(r.status).toBe(502)
    const j = await r.json()
    expect(j.error).toBe('clients_upsert_failed')
    expect(j.retries_exhausted).toBe(3)
    expect(mockBrandBooksInsert).not.toHaveBeenCalled()
    expect(mockJourneyInsert).not.toHaveBeenCalled()
  })
})

describe('POST /api/clients/upsert · retry (502 intermitente transiente)', () => {
  it('reintenta el upsert de clients en error transiente y tiene éxito (200)', async () => {
    mockClientsUpsert
      .mockResolvedValueOnce({ data: null, error: { message: 'fetch failed (transient)' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'statement timeout' } })
      .mockResolvedValue({
        data: { id: 'cid-retry', name: 'R', slug: 'r', status: 'onboarding' },
        error: null,
      })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js-r' }, error: null })

    const r = await POST(buildReq({ name: 'R' }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.client_id).toBe('cid-retry')
    // 2 fallos transientes + 1 éxito = 3 intentos
    expect(mockClientsUpsert).toHaveBeenCalledTimes(3)
  })

  it('reintenta también ante excepción (throw) y recupera', async () => {
    mockClientsUpsert
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue({ data: { id: 'cid-throw', name: 'T', slug: 't', status: 'onboarding' }, error: null })
    mockJourneyInsert.mockResolvedValue({ data: { id: 'js-t' }, error: null })

    const r = await POST(buildReq({ name: 'T' }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.client_id).toBe('cid-throw')
    expect(mockClientsUpsert).toHaveBeenCalledTimes(2)
  })

  it('agota 3 reintentos (4 intentos) y devuelve 502 con retries_exhausted', async () => {
    mockClientsUpsert.mockResolvedValue({ data: null, error: { message: 'persistent DB error' } })
    const r = await POST(buildReq({ name: 'X' }))
    expect(r.status).toBe(502)
    const j = await r.json()
    expect(j.error).toBe('clients_upsert_failed')
    expect(j.retries_exhausted).toBe(3)
    expect(mockClientsUpsert).toHaveBeenCalledTimes(4)
  })
})
