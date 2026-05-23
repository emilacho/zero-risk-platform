/**
 * Sprint 7 B5 · /api/cascade/phase-6-fanout
 *
 * Validates · auth gate · shape validation · channel validation · per-channel
 * fanout (mocked) · response shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const checkInternalKeyMock = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: checkInternalKeyMock,
}))

const fetchMock = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  checkInternalKeyMock.mockReturnValue({ ok: true })
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  process.env.INTERNAL_API_KEY = 'test-internal-key'
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

const VALID_BODY = {
  client_id: 'client-test-001',
  campaign_id: 'campaign-test-001',
  channels: ['email', 'sms'],
  payload: {
    email: { to_email: 'test@example.test', subject: 'hi', html_body: '<p>hi</p>' },
    sms: { to: '+593987654321', body: 'hi' },
  },
}

describe('Sprint 7 B5 · /api/cascade/phase-6-fanout', () => {
  it('401 without auth', async () => {
    checkInternalKeyMock.mockReturnValueOnce({ ok: false, reason: 'no key' })
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('400 invalid JSON', async () => {
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', { method: 'POST', body: 'not-json' }),
    )
    expect(res.status).toBe(400)
  })

  it('400 missing client_id', async () => {
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify({ ...VALID_BODY, client_id: '' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('400 missing campaign_id', async () => {
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify({ ...VALID_BODY, campaign_id: '' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('400 empty channels array', async () => {
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify({ ...VALID_BODY, channels: [] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('400 invalid channel name', async () => {
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify({ ...VALID_BODY, channels: ['fax', 'pigeon'] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('503 when INTERNAL_API_KEY not set on server', async () => {
    delete process.env.INTERNAL_API_KEY
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    )
    expect(res.status).toBe(503)
    process.env.INTERNAL_API_KEY = 'test-internal-key'
  })

  it('200 happy path · 2 channels · both succeed', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true,"message_id":"em1"}', { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true,"message_id":"sms1"}', { status: 200 }))
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      channels_invoked: string[]
      channels_ok: number
      channels_failed: number
      results: Array<{ channel: string; ok: boolean }>
    }
    expect(body.ok).toBe(true)
    expect(body.channels_invoked).toEqual(['email', 'sms'])
    expect(body.channels_ok).toBe(2)
    expect(body.channels_failed).toBe(0)
    expect(body.results.length).toBe(2)
  })

  it('200 with partial failure · 1 channel succeeds · 1 fails (continues)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response('{"error":"503"}', { status: 503 }))
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; channels_ok: number; channels_failed: number }
    expect(body.ok).toBe(false)
    expect(body.channels_ok).toBe(1)
    expect(body.channels_failed).toBe(1)
  })

  it('continues on network error · per-channel error captured', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; results: Array<{ channel: string; ok: boolean; error?: string }> }
    expect(body.ok).toBe(false)
    expect(body.results[0].ok).toBe(false)
    expect(body.results[0].error).toContain('ECONNREFUSED')
  })

  it('injects cascade metadata into per-channel payload', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify({
          ...VALID_BODY,
          channels: ['email'],
          payload: { email: { to_email: 'x@y.test', subject: 's' } },
        }),
      }),
    )
    const call = fetchMock.mock.calls[0]
    const sentBody = JSON.parse(call[1].body)
    expect(sentBody.client_id).toBe('client-test-001')
    expect(sentBody.campaign_id).toBe('campaign-test-001')
    expect(sentBody.cascade_phase).toBe('LAUNCH')
    expect(sentBody.cascade_source).toBe('nexus-phase-6-fanout')
  })

  it('accepts all 4 canonical channels', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    const { POST } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await POST(
      new Request('http://localhost/api/cascade/phase-6-fanout', {
        method: 'POST',
        body: JSON.stringify({
          ...VALID_BODY,
          channels: ['email', 'sms', 'whatsapp', 'landing'],
          payload: {
            email: { to_email: 'x@y.test' },
            sms: { to: '+593' },
            whatsapp: { to: '+593' },
            landing: { slug: 'x-test' },
          },
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { channels_invoked: string[] }
    expect(body.channels_invoked.length).toBe(4)
  })

  it('GET returns endpoint metadata', async () => {
    const { GET } = await import('../src/app/api/cascade/phase-6-fanout/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { endpoint: string; auth: string }
    expect(body.endpoint).toBe('/api/cascade/phase-6-fanout')
    expect(body.auth).toContain('INTERNAL_API_KEY')
  })
})

