/**
 * Tests for POST /api/calendar/book · Cal.com Cloud API v2 wrapper.
 *
 * Mocks the Cal.com Cloud HTTP call (POST /v2/bookings) + Supabase insert.
 * We don't hit Cal.com in unit tests · only the contract surface · the real
 * E2E booking against Cal.com Cloud is captured in the PR description.
 *
 * Cases:
 *   1. happy path · creates Cal.com booking · persists row · 200 + provider cal-com-cloud
 *   2. 401 when x-api-key missing
 *   3. 400 when scheduled_at missing
 *   4. 400 when contact_email missing
 *   5. 503 when CALCOM_API_KEY missing
 *   6. 400 event_type_required when no event_type_id and no CALCOM_EVENT_TYPE_ID
 *   7. 502 when Cal.com upstream rejects the booking
 *   8. 503 when calendar_bookings table missing (42P01)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const supabaseMock = {
  from: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => supabaseMock,
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  process.env.CALCOM_API_KEY = 'cal_live_test'
  process.env.CALCOM_EVENT_TYPE_ID = '6157933'
  global.fetch = fetchMock as unknown as typeof fetch
  supabaseMock.from.mockReturnThis()
  supabaseMock.insert.mockReturnThis()
  supabaseMock.select.mockReturnThis()
  supabaseMock.single.mockResolvedValue({
    data: { id: 'row-uuid', provider: 'cal-com-cloud', provider_booking_id: 'cal-uid-1' },
    error: null,
  })
})

afterEach(() => {
  delete process.env.CALCOM_API_KEY
  delete process.env.CALCOM_EVENT_TYPE_ID
  vi.restoreAllMocks()
})

async function loadRoute() {
  vi.resetModules()
  return await import('../src/app/api/calendar/book/route')
}

function req(body: Record<string, unknown>, withKey = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withKey) headers['x-api-key'] = 'test-internal-key'
  return new Request('http://localhost/api/calendar/book', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function calBookingOk() {
  return Promise.resolve({
    ok: true,
    status: 201,
    json: async () => ({
      status: 'success',
      data: {
        uid: 'cal-uid-1',
        status: 'accepted',
        start: '2026-06-30T07:00:00.000Z',
        end: '2026-06-30T07:30:00.000Z',
        meetingUrl: 'https://cal.video/cal-uid-1',
      },
    }),
  } as unknown as Response)
}

const validBody = {
  client_id: 'client-1',
  contact_email: 'lead@example.com',
  contact_name: 'Lead Uno',
  event_title: 'Kickoff',
  scheduled_at: '2026-06-30T07:00:00.000Z',
}

describe('POST /api/calendar/book · Cal.com Cloud v2', () => {
  it('1 · happy path · creates booking + persists · 200', async () => {
    fetchMock.mockReturnValueOnce(calBookingOk())
    const { POST } = await loadRoute()
    const res = await POST(req(validBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.mode).toBe('cal-com-cloud')
    expect(json.cal).toEqual({ uid: 'cal-uid-1', status: 'accepted' })

    // Cal.com called with the right URL + headers + mapped payload
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.cal.com/v2/bookings')
    expect(opts.headers.Authorization).toBe('Bearer cal_live_test')
    expect(opts.headers['cal-api-version']).toBe('2024-08-13')
    const sent = JSON.parse(opts.body)
    expect(sent.eventTypeId).toBe(6157933)
    expect(sent.attendee.email).toBe('lead@example.com')
    expect(sent.attendee.timeZone).toBe('America/Guayaquil')

    // Persisted with cloud provider + cal uid
    const inserted = supabaseMock.insert.mock.calls[0][0]
    expect(inserted.provider).toBe('cal-com-cloud')
    expect(inserted.provider_booking_id).toBe('cal-uid-1')
    expect(inserted.meeting_url).toBe('https://cal.video/cal-uid-1')
  })

  it('2 · 401 when x-api-key missing', async () => {
    const { POST } = await loadRoute()
    const res = await POST(req(validBody, false))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('3 · 400 when scheduled_at missing', async () => {
    const { POST } = await loadRoute()
    const { scheduled_at, ...noDate } = validBody
    void scheduled_at
    const res = await POST(req(noDate))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('scheduled_at_required')
  })

  it('4 · 400 when contact_email missing', async () => {
    const { POST } = await loadRoute()
    const { contact_email, ...noEmail } = validBody
    void contact_email
    const res = await POST(req(noEmail))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('contact_email_required')
  })

  it('5 · 503 when CALCOM_API_KEY missing', async () => {
    delete process.env.CALCOM_API_KEY
    const { POST } = await loadRoute()
    const res = await POST(req(validBody))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('ServiceUnconfigured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('6 · 400 event_type_required when no event type configured', async () => {
    delete process.env.CALCOM_EVENT_TYPE_ID
    const { POST } = await loadRoute()
    const res = await POST(req(validBody))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('event_type_required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('7 · 502 when Cal.com upstream rejects', async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({ status: 'error', error: { message: 'no_available_users_found_error' } }),
      } as unknown as Response),
    )
    const { POST } = await loadRoute()
    const res = await POST(req(validBody))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('cal_com_upstream_failed')
  })

  it('8 · 503 when calendar_bookings table missing', async () => {
    fetchMock.mockReturnValueOnce(calBookingOk())
    supabaseMock.single.mockResolvedValueOnce({ data: null, error: { code: '42P01' } })
    const { POST } = await loadRoute()
    const res = await POST(req(validBody))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('ServiceUnconfigured')
  })
})
