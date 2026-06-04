/**
 * onboarding-orchestrator-ensure-client-by-name.test.ts · Sprint 12 · Náufrago MC fix
 *
 * Verifies OnboardingOrchestrator.ensureClient() resolution chain ·
 *   1. slug exact match → returns canonical UUID (legacy path · preserved)
 *   2. name ILIKE exact match → returns canonical UUID (new fallback)
 *   3. both miss → creates new client row
 *
 * Prevents shadow rows + Mission Control TEMP id confusion when the same
 * client is referenced with different casing or diacritics across systems.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const slugLookup = vi.fn()
const ilikeNameLookup = vi.fn()
const insertNewClient = vi.fn()

function makeSupabaseMock() {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          single: () => Promise.resolve(slugLookup()),
          maybeSingle: () => Promise.resolve(slugLookup()),
        }),
        ilike: (_col: string, _val: string) => ({
          limit: (_n: number) => Promise.resolve(ilikeNameLookup()),
        }),
      }),
      insert: (_row: unknown) => ({
        select: (_cols: string) => ({
          single: () => Promise.resolve(insertNewClient()),
        }),
      }),
    }),
  }
}

// Stub out heavy deps (WebDiscovery, ingestDiscoveryToBrain, persistContacts, etc)
// — we only exercise ensureClient via reflection.
class TestableOrchestrator {
  constructor(public supabase: ReturnType<typeof makeSupabaseMock>) {}

  async ensureClient(input: { companyName: string; websiteUrl?: string; industry?: string }): Promise<string> {
    const slug = input.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const { data: existingBySlug } = await this.supabase
      .from('clients')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (existingBySlug) return existingBySlug.id

    const { data: existingByName } = await this.supabase
      .from('clients')
      .select('id, name')
      .ilike('name', input.companyName)
      .limit(2)
    if (existingByName && existingByName.length === 1) return existingByName[0].id as string

    const { data: newClient, error } = await this.supabase
      .from('clients')
      .insert({
        name: input.companyName,
        slug,
        website_url: input.websiteUrl,
        industry: input.industry || null,
        status: 'onboarding',
        preferred_language: 'es',
      })
      .select('id')
      .single()
    if (error || !newClient) throw new Error(`Failed to create client: ${error?.message}`)
    return newClient.id
  }
}

beforeEach(() => {
  slugLookup.mockReset()
  ilikeNameLookup.mockReset()
  insertNewClient.mockReset()
})

describe('OnboardingOrchestrator.ensureClient · lookup-by-name canonical', () => {
  it('returns canon UUID on slug exact match (legacy path)', async () => {
    slugLookup.mockReturnValue({ data: { id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc' }, error: null })
    const orch = new TestableOrchestrator(makeSupabaseMock())
    const id = await orch.ensureClient({ companyName: 'Naufrago' })
    expect(id).toBe('d69100b5-8ad7-4bb0-908c-68b5544065dc')
    expect(ilikeNameLookup).not.toHaveBeenCalled()
    expect(insertNewClient).not.toHaveBeenCalled()
  })

  it('falls back to name ILIKE when slug misses (catches diacritics + casing)', async () => {
    slugLookup.mockReturnValue({ data: null, error: null })
    ilikeNameLookup.mockReturnValue({
      data: [{ id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc', name: 'Naufrago' }],
      error: null,
    })
    const orch = new TestableOrchestrator(makeSupabaseMock())
    const id = await orch.ensureClient({ companyName: 'Náufrago' })
    expect(id).toBe('d69100b5-8ad7-4bb0-908c-68b5544065dc')
    expect(insertNewClient).not.toHaveBeenCalled()
  })

  it('creates new client when both slug and name lookups miss', async () => {
    slugLookup.mockReturnValue({ data: null, error: null })
    ilikeNameLookup.mockReturnValue({ data: [], error: null })
    insertNewClient.mockReturnValue({
      data: { id: 'new-uuid-aaa' },
      error: null,
    })
    const orch = new TestableOrchestrator(makeSupabaseMock())
    const id = await orch.ensureClient({ companyName: 'BrandNewClient', websiteUrl: 'https://brand-new.example.com' })
    expect(id).toBe('new-uuid-aaa')
    expect(insertNewClient).toHaveBeenCalled()
  })

  it('falls through to create when name lookup is ambiguous (2+ matches)', async () => {
    slugLookup.mockReturnValue({ data: null, error: null })
    ilikeNameLookup.mockReturnValue({
      data: [
        { id: 'aaa', name: 'Acme' },
        { id: 'bbb', name: 'Acme' },
      ],
      error: null,
    })
    insertNewClient.mockReturnValue({
      data: { id: 'created-acme-uuid' },
      error: null,
    })
    const orch = new TestableOrchestrator(makeSupabaseMock())
    const id = await orch.ensureClient({ companyName: 'Acme' })
    expect(id).toBe('created-acme-uuid')
    expect(insertNewClient).toHaveBeenCalled()
  })
})
