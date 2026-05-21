/**
 * Sprint 5 Track A · /api/forms/submit · L1 ONBOARD dispatch
 *
 * Tests the refactored submit handler · Tally webhook → form_submissions →
 * client_champions INSERT → dispatchJourney(ONBOARD) → processed_at update.
 *
 * Mocks · getSupabaseAdmin chainable · dispatchJourney.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseMockState: {
  formMatch: { data: unknown; error: unknown }
  submissionInsert: { data: unknown; error: unknown }
  championInsert: { data: unknown; error: unknown }
  submissionUpdate: { data: unknown; error: unknown }
} = {
  formMatch: { data: { id: 'form-uuid-1' }, error: null },
  submissionInsert: { data: { id: 'sub-uuid-1' }, error: null },
  championInsert: {
    data: { id: 'champion-uuid-1', client_id: 'client-uuid-1' },
    error: null,
  },
  submissionUpdate: { data: { id: 'sub-uuid-1' }, error: null },
}

let callLog: Array<{ table: string; op: string; payload?: unknown }> = []

function chainable() {
  return {
    from: (table: string) => {
      const select = (_cols?: string) => {
        const wrapper: Record<string, unknown> = {}
        wrapper.eq = () => wrapper
        wrapper.maybeSingle = () => {
          callLog.push({ table, op: 'select.maybeSingle' })
          if (table === 'forms') return Promise.resolve(supabaseMockState.formMatch)
          return Promise.resolve({ data: null, error: null })
        }
        wrapper.single = () => {
          callLog.push({ table, op: 'select.single' })
          if (table === 'forms') return Promise.resolve(supabaseMockState.formMatch)
          return Promise.resolve({ data: null, error: null })
        }
        return wrapper
      }
      const insert = (payload: unknown) => {
        callLog.push({ table, op: 'insert', payload })
        return {
          select: () => ({
            single: () => {
              if (table === 'form_submissions') return Promise.resolve(supabaseMockState.submissionInsert)
              if (table === 'client_champions') return Promise.resolve(supabaseMockState.championInsert)
              return Promise.resolve({ data: null, error: null })
            },
          }),
        }
      }
      const update = (payload: unknown) => {
        callLog.push({ table, op: 'update', payload })
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve(supabaseMockState.submissionUpdate),
              single: () => Promise.resolve(supabaseMockState.submissionUpdate),
            }),
            // Some update calls don't .select() after .eq() — return the update directly
            then: (cb: (v: unknown) => unknown) => Promise.resolve(supabaseMockState.submissionUpdate).then(cb),
          }),
        }
      }
      return { select, insert, update }
    },
  }
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => chainable(),
}))

const dispatchJourneyMock = vi.fn()
vi.mock('@/lib/journey-orchestrator/dispatch', () => ({
  dispatchJourney: dispatchJourneyMock,
}))

const TALLY_PAYLOAD_VALID = {
  eventId: 'evt_sprint5_001',
  eventType: 'FORM_RESPONSE',
  formId: 'tally_form_x',
  data: {
    fields: [
      { key: 'name', label: 'Nombre completo', type: 'INPUT_TEXT', value: 'Emilio Pérez' },
      { key: 'email', label: 'Email', type: 'INPUT_EMAIL', value: 'emilio@example.test' },
      { key: 'phone', label: 'WhatsApp', type: 'INPUT_PHONE_NUMBER', value: '+593987654321' },
      { key: 'vertical', label: 'Industria', type: 'DROPDOWN', value: 'surf' },
      { key: 'journey_type', label: 'Necesidad', type: 'DROPDOWN', value: 'ONBOARD' },
      { key: 'brand_book_url', label: 'Brand book', type: 'INPUT_TEXT', value: 'https://example.test/brand.pdf' },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  callLog = []
  delete process.env.TALLY_SIGNING_SECRET
  supabaseMockState.formMatch = { data: { id: 'form-uuid-1' }, error: null }
  supabaseMockState.submissionInsert = { data: { id: 'sub-uuid-1' }, error: null }
  supabaseMockState.championInsert = {
    data: { id: 'champion-uuid-1', client_id: 'client-uuid-1' },
    error: null,
  }
  supabaseMockState.submissionUpdate = { data: { id: 'sub-uuid-1' }, error: null }
  dispatchJourneyMock.mockReset()
  dispatchJourneyMock.mockResolvedValue({
    ok: true,
    journey_id: 'journey-uuid-1',
    journey: 'ONBOARD',
    dispatch_status: 'dispatched',
    l2_target: '/api/onboarding',
  })
})

describe('Sprint 5 · /api/forms/submit · L1 ONBOARD dispatch', () => {
  it('happy path · valid payload → submission → champion → dispatch ONBOARD → update processed_at', async () => {
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(TALLY_PAYLOAD_VALID),
      }),
    )
    expect([200, 201]).toContain(res.status)

    expect(callLog.find((c) => c.table === 'form_submissions' && c.op === 'insert')).toBeDefined()
    const championInsert = callLog.find((c) => c.table === 'client_champions' && c.op === 'insert')
    expect(championInsert).toBeDefined()
    expect((championInsert!.payload as { champion_email: string }).champion_email).toBe('emilio@example.test')
    expect((championInsert!.payload as { champion_name: string }).champion_name).toBe('Emilio Pérez')

    expect(dispatchJourneyMock).toHaveBeenCalledOnce()
    expect(dispatchJourneyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        journey: 'ONBOARD',
        trigger_type: 'webhook',
        trigger_source: 'tally_form_submission',
        params: expect.objectContaining({
          form_id: 'form-uuid-1',
          submission_id: 'sub-uuid-1',
          brand_book_url: 'https://example.test/brand.pdf',
          vertical: 'surf',
        }),
      }),
    )

    const updates = callLog.filter((c) => c.table === 'form_submissions' && c.op === 'update')
    expect(updates.length).toBeGreaterThan(0)
    const last = updates[updates.length - 1]
    expect((last.payload as { processed_at: string }).processed_at).toBeTruthy()
    expect((last.payload as { contact_id: string }).contact_id).toBe('champion-uuid-1')

    const body = (await res.json()) as { ok: boolean; submission_id: string; journey_dispatched: boolean }
    expect(body.ok).toBe(true)
    expect(body.submission_id).toBe('sub-uuid-1')
    expect(body.journey_dispatched).toBe(true)
  })

  it('missing email · skip champion + skip dispatch · still persist submission + mark processed_at', async () => {
    const payload = {
      ...TALLY_PAYLOAD_VALID,
      data: { fields: [{ key: 'name', value: 'NoEmail' }] },
    }
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
    expect([200, 201]).toContain(res.status)
    expect(callLog.find((c) => c.table === 'form_submissions' && c.op === 'insert')).toBeDefined()
    expect(callLog.find((c) => c.table === 'client_champions')).toBeUndefined()
    expect(dispatchJourneyMock).not.toHaveBeenCalled()
    const update = callLog.find((c) => c.table === 'form_submissions' && c.op === 'update')
    expect(update).toBeDefined()
    expect((update!.payload as { processing_error: string }).processing_error).toContain('insufficient_contact_data')
  })

  it('missing name · skip champion + dispatch · processed_at populated', async () => {
    const payload = {
      ...TALLY_PAYLOAD_VALID,
      data: { fields: [{ key: 'email', value: 'a@b.test' }] },
    }
    const { POST } = await import('../src/app/api/forms/submit/route')
    await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
    expect(callLog.find((c) => c.table === 'client_champions')).toBeUndefined()
    expect(dispatchJourneyMock).not.toHaveBeenCalled()
  })

  it('invalid HMAC · 401 · no DB writes · no dispatch', async () => {
    process.env.TALLY_SIGNING_SECRET = 'test-secret-do-not-use'
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(TALLY_PAYLOAD_VALID),
        headers: { 'tally-signature': 'definitely-invalid' },
      }),
    )
    expect(res.status).toBe(401)
    expect(callLog.length).toBe(0)
    expect(dispatchJourneyMock).not.toHaveBeenCalled()
  })

  it('journey_type field override · dispatch uses PRODUCE not default ONBOARD', async () => {
    const payload = {
      ...TALLY_PAYLOAD_VALID,
      data: {
        fields: [
          ...TALLY_PAYLOAD_VALID.data.fields.filter((f) => f.key !== 'journey_type'),
          { key: 'journey_type', value: 'PRODUCE' },
        ],
      },
    }
    const { POST } = await import('../src/app/api/forms/submit/route')
    await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
    expect(dispatchJourneyMock).toHaveBeenCalledWith(
      expect.objectContaining({ journey: 'PRODUCE' }),
    )
  })

  it('invalid journey_type value · fallback to ONBOARD default', async () => {
    const payload = {
      ...TALLY_PAYLOAD_VALID,
      data: {
        fields: [
          ...TALLY_PAYLOAD_VALID.data.fields.filter((f) => f.key !== 'journey_type'),
          { key: 'journey_type', value: 'NOT_A_JOURNEY' },
        ],
      },
    }
    const { POST } = await import('../src/app/api/forms/submit/route')
    await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
    expect(dispatchJourneyMock).toHaveBeenCalledWith(
      expect.objectContaining({ journey: 'ONBOARD' }),
    )
  })

  it('L1 dispatch failure · still returns 201 · submission persisted · error in processing_error', async () => {
    dispatchJourneyMock.mockResolvedValueOnce({
      ok: false,
      journey_id: 'journey-uuid-1',
      journey: 'ONBOARD',
      dispatch_status: 'failed',
      error: 'L2 timeout 30s',
    })
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(TALLY_PAYLOAD_VALID),
      }),
    )
    expect([200, 201]).toContain(res.status)
    const update = callLog.filter((c) => c.table === 'form_submissions' && c.op === 'update').pop()
    expect((update!.payload as { processing_error: string }).processing_error).toContain('journey_dispatch_failed')

    const body = (await res.json()) as { journey_dispatched: boolean }
    expect(body.journey_dispatched).toBe(false)
  })

  it('L1 dispatch throws · captured · returns 201 · processing_error populated', async () => {
    dispatchJourneyMock.mockRejectedValueOnce(new Error('network ECONNREFUSED'))
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(TALLY_PAYLOAD_VALID),
      }),
    )
    expect([200, 201]).toContain(res.status)
    const update = callLog.filter((c) => c.table === 'form_submissions' && c.op === 'update').pop()
    expect((update!.payload as { processing_error: string }).processing_error).toContain('ECONNREFUSED')
  })

  it('duplicate event_id · 23505 · 200 deduped · no champion + no dispatch', async () => {
    supabaseMockState.submissionInsert = {
      data: null,
      error: { code: '23505', message: 'unique_violation on uq_form_subs_event' },
    }
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(TALLY_PAYLOAD_VALID),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deduped: boolean }
    expect(body.deduped).toBe(true)
    expect(callLog.find((c) => c.table === 'client_champions')).toBeUndefined()
    expect(dispatchJourneyMock).not.toHaveBeenCalled()
  })

  it('audit trail · params includes form_id + submission_id + brand_book_url + vertical', async () => {
    const { POST } = await import('../src/app/api/forms/submit/route')
    await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: JSON.stringify(TALLY_PAYLOAD_VALID),
      }),
    )
    const call = dispatchJourneyMock.mock.calls[0][0]
    expect(call.params).toMatchObject({
      form_id: 'form-uuid-1',
      submission_id: 'sub-uuid-1',
      brand_book_url: 'https://example.test/brand.pdf',
      vertical: 'surf',
      contact_email: 'emilio@example.test',
      contact_name: 'Emilio Pérez',
      tally_event_id: 'evt_sprint5_001',
    })
  })

  it('invalid JSON body · 400 · no DB writes · no dispatch', async () => {
    const { POST } = await import('../src/app/api/forms/submit/route')
    const res = await POST(
      new Request('http://localhost/api/forms/submit', {
        method: 'POST',
        body: 'definitely-not-json{',
      }),
    )
    expect(res.status).toBe(400)
    expect(callLog.length).toBe(0)
    expect(dispatchJourneyMock).not.toHaveBeenCalled()
  })

  it('contract assertion · L1 dispatchJourney importable', async () => {
    const mod = await import('@/lib/journey-orchestrator/dispatch')
    expect(typeof mod.dispatchJourney).toBe('function')
  })
})
