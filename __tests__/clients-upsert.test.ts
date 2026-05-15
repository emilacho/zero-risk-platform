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
const mockBrandBooksInsert = vi.fn()
const mockJourneyInsert = vi.fn()
const mockGetSupabaseAdmin = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}))

// Build a Supabase chain-mock that maps table name → behaviour stub.
function buildSupabaseMock() {
  return {
    from(table: string) {
      if (table === 'clients') {
        return {
          upsert: () => ({
            select: () => ({
              single: () => mockClientsUpsert(),
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

  it('returns 502 when clients upsert fails (hard error, can\'t proceed)', async () => {
    mockClientsUpsert.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "clients_slug_key"' },
    })
    const r = await POST(buildReq({ name: 'X', slug: 'existing' }))
    expect(r.status).toBe(502)
    const j = await r.json()
    expect(j.error).toBe('clients_upsert_failed')
    expect(j.detail).toContain('duplicate key')
    expect(mockBrandBooksInsert).not.toHaveBeenCalled()
    expect(mockJourneyInsert).not.toHaveBeenCalled()
  })
})
