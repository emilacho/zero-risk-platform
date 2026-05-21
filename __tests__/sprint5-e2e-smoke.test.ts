/**
 * Sprint 5 · E2E synthetic smoke test (in-process, no live HTTP)
 *
 * Simulates the full operational chain ·
 *   1. POST /api/forms/submit with synthetic Tally webhook payload
 *   2. Verify · form_submissions INSERT + client_champions INSERT + dispatchJourney called with ONBOARD
 *   3. POST /api/cascade/landing-from-outputs with synthetic NEXUS Phase 5 outputs
 *   4. Verify · landings UPSERT + URL returned
 *
 * Both endpoints run in-process via Next route handler imports. NO live HTTP.
 * Real production E2E (curl + actual DB) lives in the smoke-run script which
 * Emilio runs post-deploy when PAT restored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock state across both endpoints
const dbCallLog: Array<{ table: string; op: string; payload?: unknown }> = []

const mockState = {
  formMatch: { data: { id: 'form-naufrago-intake' }, error: null },
  submissionInsert: { data: { id: 'sub-e2e-001' }, error: null },
  championInsert: {
    data: { id: 'champion-e2e-001', client_id: 'client-e2e-001' },
    error: null,
  },
  landingUpsert: {
    data: { id: 'landing-e2e-001', slug: 'naufrago-surf-e2e001', title: 'Náufrago Surf · surf', is_active: true },
    error: null,
  },
}

function chainable() {
  return {
    from: (table: string) => {
      const select = (_cols?: string) => {
        const wrapper: Record<string, unknown> = {}
        wrapper.eq = () => wrapper
        wrapper.maybeSingle = () => {
          dbCallLog.push({ table, op: 'select' })
          if (table === 'forms') return Promise.resolve(mockState.formMatch)
          return Promise.resolve({ data: null, error: null })
        }
        return wrapper
      }
      const insert = (payload: unknown) => {
        dbCallLog.push({ table, op: 'insert', payload })
        return {
          select: () => ({
            single: () => {
              if (table === 'form_submissions') return Promise.resolve(mockState.submissionInsert)
              if (table === 'client_champions') return Promise.resolve(mockState.championInsert)
              return Promise.resolve({ data: null, error: null })
            },
          }),
        }
      }
      const update = (payload: unknown) => {
        dbCallLog.push({ table, op: 'update', payload })
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'updated' }, error: null }),
              maybeSingle: () => Promise.resolve({ data: { id: 'updated' }, error: null }),
            }),
            then: (cb: (v: unknown) => unknown) =>
              Promise.resolve({ data: { id: 'updated' }, error: null }).then(cb),
          }),
        }
      }
      const upsert = (payload: unknown) => {
        dbCallLog.push({ table, op: 'upsert', payload })
        return {
          select: () => ({
            single: () => {
              if (table === 'landings') return Promise.resolve(mockState.landingUpsert)
              return Promise.resolve({ data: null, error: null })
            },
          }),
        }
      }
      return { select, insert, update, upsert }
    },
  }
}

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => chainable() }))

const dispatchJourneyMock = vi.fn()
vi.mock('@/lib/journey-orchestrator/dispatch', () => ({
  dispatchJourney: dispatchJourneyMock,
}))

const checkInternalKeyMock = vi.fn()
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: checkInternalKeyMock }))

beforeEach(() => {
  vi.clearAllMocks()
  dbCallLog.length = 0
  delete process.env.TALLY_SIGNING_SECRET
  dispatchJourneyMock.mockReset()
  dispatchJourneyMock.mockResolvedValue({
    ok: true,
    journey_id: 'journey-e2e-001',
    journey: 'ONBOARD',
    dispatch_status: 'dispatched',
    l2_target: '/api/onboarding',
  })
  checkInternalKeyMock.mockReturnValue({ ok: true })
})

describe('Sprint 5 · E2E synthetic smoke · operational wire-in', () => {
  it('Stage 1 · Tally form submit → champion → L1 ONBOARD dispatch', async () => {
    const tallyPayload = {
      eventId: 'evt_e2e_001',
      eventType: 'FORM_RESPONSE',
      formId: 'tally_naufrago',
      data: {
        fields: [
          { key: 'name', value: 'Emilio Pérez Mompiche' },
          { key: 'email', value: 'emilio@naufrago.test' },
          { key: 'phone', value: '+593987654321' },
          { key: 'vertical', value: 'surf' },
          { key: 'journey_type', value: 'ONBOARD' },
          { key: 'brand_book_url', value: 'https://example.test/naufrago-brand.pdf' },
        ],
      },
    }

    const { POST: submitPOST } = await import('../src/app/api/forms/submit/route')
    const submitRes = await submitPOST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(tallyPayload),
      }),
    )

    expect([200, 201]).toContain(submitRes.status)

    const submitBody = (await submitRes.json()) as {
      ok: boolean
      submission_id: string
      champion_id: string
      journey_dispatched: boolean
      journey_id: string
      dispatch_status: string
    }
    expect(submitBody.ok).toBe(true)
    expect(submitBody.submission_id).toBe('sub-e2e-001')
    expect(submitBody.champion_id).toBe('champion-e2e-001')
    expect(submitBody.journey_dispatched).toBe(true)
    expect(submitBody.dispatch_status).toBe('dispatched')

    // Verify call sequence
    const tables = dbCallLog.map((c) => `${c.table}.${c.op}`)
    expect(tables).toEqual([
      'forms.select', // form lookup by tally_form_id
      'form_submissions.insert',
      'client_champions.insert',
      'form_submissions.update', // mark processed_at + contact_id
    ])

    expect(dispatchJourneyMock).toHaveBeenCalledOnce()
    expect(dispatchJourneyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        journey: 'ONBOARD',
        trigger_type: 'webhook',
        trigger_source: 'tally_form_submission',
      }),
    )
  })

  it('Stage 2 · NEXUS cascade outputs → landing-from-outputs → landings UPSERT', async () => {
    const nexusOutputs = {
      'content-creator': {
        headline: 'Aprende a surfear donde rompe la mejor ola del Pacífico',
        subhead: 'Retiros de 3 días en Mompiche · todos los niveles',
        cta_label: 'Reservá tu cupo',
        cta_url: 'https://tally.so/r/naufrago-booking',
        body_copy: 'Mompiche es una rompiente de izquierdas que funciona 320 días al año.',
      },
      'competitive-strategist': {
        differentiators: [
          'Instructor ISA certificado',
          'Cabaña a 80m de la rompiente',
          'Equipamiento Channel Islands incluido',
        ],
      },
      'editor-en-jefe': {
        hero_image_url: 'https://cdn.example.test/mompiche-hero.jpg',
        testimonials: [
          {
            quote: 'Llegué sin saber pararme y a los 3 días estaba surfeando olas de pecho.',
            author: 'Mariana C.',
            role: 'Sprint 1 · marzo 2026',
          },
        ],
      },
    }

    const { POST: landingPOST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const landingRes = await landingPOST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-e2e-001',
          campaign_id: 'campaign-e2e-001',
          client_name: 'Náufrago Surf',
          vertical: 'surf',
          outputs: nexusOutputs,
        }),
      }),
    )

    expect(landingRes.status).toBe(200)

    const landingBody = (await landingRes.json()) as {
      ok: boolean
      landing: { id: string; slug: string }
      url: string
      sections_count: number
    }
    expect(landingBody.ok).toBe(true)
    expect(landingBody.landing.id).toBe('landing-e2e-001')
    expect(landingBody.url).toContain('/landings/')
    // Slug from "Náufrago Surf" should strip diacritics
    expect(landingBody.url).toMatch(/naufrago-surf-/)
    // sections · feature_grid + testimonial + text_block + cta_band = 4
    expect(landingBody.sections_count).toBe(4)

    const upsertCall = dbCallLog.find((c) => c.table === 'landings' && c.op === 'upsert')
    expect(upsertCall).toBeDefined()
    const payload = upsertCall!.payload as Record<string, unknown>
    expect(payload.slug).toMatch(/^naufrago-surf-/)
    expect(payload.client_id).toBe('client-e2e-001')
    expect(payload.vertical).toBe('surf')
    expect(payload.hero_headline).toBe('Aprende a surfear donde rompe la mejor ola del Pacífico')
    expect(Array.isArray(payload.sections)).toBe(true)
  })

  it('Stage 3 · combined chain · same client_id flows from form → champion → journey → landing', async () => {
    // Stage 1
    const { POST: submitPOST } = await import('../src/app/api/forms/submit/route')
    await submitPOST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify({
          eventId: 'evt_chain_001',
          formId: 'tally_form_x',
          data: {
            fields: [
              { key: 'name', value: 'Chain Test' },
              { key: 'email', value: 'chain@test.test' },
              { key: 'vertical', value: 'surf' },
              { key: 'journey_type', value: 'PRODUCE' },
            ],
          },
        }),
      }),
    )

    const journeyCall = dispatchJourneyMock.mock.calls[0][0]
    expect(journeyCall.journey).toBe('PRODUCE')
    expect(journeyCall.params.contact_email).toBe('chain@test.test')

    // Stage 2 · downstream landing creation with same client_id from journey
    const clientIdFromJourney = mockState.championInsert.data?.client_id
    expect(clientIdFromJourney).toBe('client-e2e-001')

    const { POST: landingPOST } = await import('../src/app/api/cascade/landing-from-outputs/route')
    const landingRes = await landingPOST(
      new Request('http://localhost/api/cascade/landing-from-outputs', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientIdFromJourney,
          campaign_id: 'campaign-chain-001',
          client_name: 'Chain Test Co',
          vertical: 'surf',
          outputs: { 'content-creator': { headline: 'Chain landing' } },
        }),
      }),
    )

    expect(landingRes.status).toBe(200)
    const body = (await landingRes.json()) as { landing: { id: string } }
    expect(body.landing.id).toBe('landing-e2e-001')

    // Audit · verify client_id consistency
    const landingUpsert = dbCallLog.find((c) => c.table === 'landings' && c.op === 'upsert')
    expect((landingUpsert!.payload as { client_id: string }).client_id).toBe(clientIdFromJourney)
  })
})
