/**
 * POST /api/cascade/phase-6-fanout · Sprint 7 Track B5 · CC#2
 *
 * NEXUS Phase 6 LAUNCH (V3 canon · V2 alias "PUBLISH") fanout to Stack V4
 * outbound channels · email · sms · whatsapp · landings.
 *
 * Per cascade canon (CLAUDE.md 2026-05-16) · this endpoint is single-purpose ·
 * channel orchestration · NO agent invocations · sub-second response · fans
 * out to existing single-purpose endpoints which handle the actual provider
 * calls.
 *
 * Auth · INTERNAL_API_KEY.
 *
 * Body shape ·
 *   {
 *     client_id: string,
 *     campaign_id: string,
 *     channels: Array<'email' | 'sms' | 'whatsapp' | 'landing'>,
 *     payload: {
 *       email?: { to_email, subject, html_body, ... }
 *       sms?: { to, body, ... }
 *       whatsapp?: { to, template_name, components, ... }
 *       landing?: { slug, title, hero_headline, sections, ... }
 *     }
 *   }
 *
 * Response · per-channel result map · each channel records ·
 *   { ok: boolean, status: number, body_preview: string, channel: string }
 *
 * Continues on per-channel failure (one bad channel doesn't kill the cascade).
 * Returns 200 even if individual channels fail · check per-channel `ok`.
 * Returns 401 only on auth fail · 400 only on shape validation fail.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Channel = 'email' | 'sms' | 'whatsapp' | 'landing'
const VALID_CHANNELS: ReadonlySet<Channel> = new Set(['email', 'sms', 'whatsapp', 'landing'])

interface FanoutBody {
  client_id?: string
  campaign_id?: string
  channels?: Channel[]
  payload?: Record<Channel, Record<string, unknown> | undefined>
}

interface ChannelResult {
  channel: Channel
  ok: boolean
  status: number
  body_preview: string
  error?: string
}

function getBaseUrl(): string {
  return (
    process.env.ZERO_RISK_API_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://zero-risk-platform.vercel.app')
  )
}

async function callChannelEndpoint(
  channel: Channel,
  body: Record<string, unknown>,
  apiKey: string,
  timeoutMs = 30000,
): Promise<ChannelResult> {
  const baseUrl = getBaseUrl()
  const urlByChannel: Record<Channel, string> = {
    email: `${baseUrl}/api/email/send`,
    sms: `${baseUrl}/api/sms/send`,
    whatsapp: `${baseUrl}/api/whatsapp/send`,
    landing: `${baseUrl}/api/landings`,
  }
  const url = urlByChannel[channel]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await r.text().catch(() => '')
    return {
      channel,
      ok: r.ok,
      status: r.status,
      body_preview: text.slice(0, 300),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      channel,
      ok: false,
      status: 0,
      body_preview: '',
      error: msg,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: FanoutBody
  try {
    body = (await request.json()) as FanoutBody
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', code: 'E-FANOUT-JSON' },
      { status: 400 },
    )
  }

  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : ''
  const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id.trim() : ''
  const channels = Array.isArray(body.channels) ? body.channels : []
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : ({} as Record<Channel, Record<string, unknown> | undefined>)

  if (!clientId) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-FANOUT-CLIENT-ID', detail: 'client_id required' },
      { status: 400 },
    )
  }
  if (!campaignId) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-FANOUT-CAMPAIGN-ID', detail: 'campaign_id required' },
      { status: 400 },
    )
  }
  if (channels.length === 0) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-FANOUT-CHANNELS', detail: 'channels array must have at least 1 entry' },
      { status: 400 },
    )
  }

  // Validate channel names
  const invalidChannels = channels.filter((c) => !VALID_CHANNELS.has(c))
  if (invalidChannels.length > 0) {
    return NextResponse.json(
      {
        error: 'validation_error',
        code: 'E-FANOUT-INVALID-CHANNEL',
        detail: `invalid channels · ${invalidChannels.join(', ')} · allowed · ${Array.from(VALID_CHANNELS).join(', ')}`,
      },
      { status: 400 },
    )
  }

  const apiKey = process.env.INTERNAL_API_KEY || ''
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'service_unconfigured',
        code: 'E-FANOUT-NO-API-KEY',
        detail: 'INTERNAL_API_KEY not set on server · cannot fan out to channel endpoints',
      },
      { status: 503 },
    )
  }

  // Fan out · per-channel call · accumulate results · NEVER throw out of catch
  const results: ChannelResult[] = []
  for (const channel of channels) {
    const channelPayload = payload[channel] ?? {}
    // Inject client_id + campaign_id into per-channel payload for traceability
    const enrichedPayload = {
      ...channelPayload,
      client_id: clientId,
      campaign_id: campaignId,
      cascade_phase: 'LAUNCH',
      cascade_source: 'nexus-phase-6-fanout',
    }
    const result = await callChannelEndpoint(channel, enrichedPayload, apiKey)
    results.push(result)
  }

  const okCount = results.filter((r) => r.ok).length
  return NextResponse.json({
    ok: okCount === results.length,
    client_id: clientId,
    campaign_id: campaignId,
    channels_invoked: channels,
    channels_ok: okCount,
    channels_failed: results.length - okCount,
    results,
    timestamp: new Date().toISOString(),
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cascade/phase-6-fanout',
    method: 'POST',
    purpose:
      'NEXUS Phase 6 LAUNCH fanout to Stack V4 outbound channels · cascade-canon compliant Storage I/O endpoint per CLAUDE.md 2026-05-16',
    auth: 'x-api-key INTERNAL_API_KEY',
    body_shape: {
      client_id: 'string (required)',
      campaign_id: 'string (required)',
      channels: "Array<'email'|'sms'|'whatsapp'|'landing'>",
      payload: 'Record<channel, channel-specific body>',
    },
    canonical_workflow_integration: {
      n8n_node: 'httpRequest POST $ZERO_RISK_API_URL/api/cascade/phase-6-fanout',
      auth: 'x-api-key: $INTERNAL_API_KEY',
      trigger: 'NEXUS 7-Phase Orchestrator workflow · post-LAUNCH callback',
    },
  })
}
