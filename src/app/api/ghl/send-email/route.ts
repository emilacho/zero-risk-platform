/**
 * POST /api/ghl/send-email — DEPRECATED shim · 2026-05-20 Sprint 3 D2.
 *
 * Original GHL stub (`fallback_mode: true · synthetic message_id`) is
 * replaced canonically by `/api/email/send` (Resend wrapper per Stack
 * V4 GHL-Out master plan).
 *
 * This route is preserved as a thin pass-through for backwards-compat
 * with n8n workflows that still POST here · sunset 2 weeks after the
 * V4 cutover (date in `X-Sunset` header). Each call ·
 *
 *   1. Adds `X-Deprecated: true` + `X-Sunset` + `X-Successor` headers
 *      so monitoring (and any human reading the response) sees it
 *   2. Logs the caller fingerprint to `ghl_email_log` for migration
 *      audit (which workflow / which IP still hits us)
 *   3. Forwards the body to the internal `/api/email/send` handler
 *      directly · NO outbound HTTP (avoids extra hop)
 *
 * Body shape is the legacy one (`to_email · subject · body · from_name
 * · from_email · reply_to · contact_id · template_id · client_id ·
 * campaign_id · metadata`) · normalized to canonical Resend shape by
 * `/api/email/send`'s own `normalizeBody()` helper.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const SUNSET_DATE = '2026-06-03' // 2 weeks post-Sprint-3-D2 ship

interface LegacyGhlInput {
  to_email?: string
  subject?: string
  body?: string
  from_name?: string | null
  from_email?: string | null
  reply_to?: string | null
  contact_id?: string | null
  template_id?: string | null
  client_id?: string | null
  campaign_id?: string | null
  metadata?: Record<string, unknown> | null
}

function deprecationHeaders(): Record<string, string> {
  return {
    'X-Deprecated': 'true',
    'X-Sunset': SUNSET_DATE,
    'X-Successor': '/api/email/send',
    'X-Deprecation-Reason': 'Stack V4 GHL-Out migration · Resend canon',
  }
}

async function logDeprecatedCall(args: {
  to_email: string
  subject: string
  caller_ua: string | null
  caller_ip: string | null
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('ghl_email_log').insert({
      message_id: `shim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      to_email: args.to_email,
      subject: args.subject.slice(0, 500),
      status: 'shim_forwarded',
      metadata: {
        deprecation: {
          sunset: SUNSET_DATE,
          successor: '/api/email/send',
          caller_ua: args.caller_ua,
          caller_ip: args.caller_ip,
        },
      },
      queued_at: new Date().toISOString(),
    })
  } catch {
    // Audit is best-effort.
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401, headers: deprecationHeaders() },
    )
  }

  let raw: LegacyGhlInput
  try {
    raw = (await request.json()) as LegacyGhlInput
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400, headers: deprecationHeaders() },
    )
  }

  // Audit · which caller still hits the deprecated route.
  void logDeprecatedCall({
    to_email: raw.to_email ?? '',
    subject: raw.subject ?? '',
    caller_ua: request.headers.get('user-agent'),
    caller_ip:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
  })

  // Map legacy → canonical shape and forward via the internal helper
  // (no HTTP round-trip · directly invoke sendEmail).
  if (!raw.to_email) {
    return NextResponse.json(
      { ok: false, error: 'to_email_required', code: 'InvalidInput' },
      { status: 400, headers: deprecationHeaders() },
    )
  }
  const fromCombined =
    raw.from_name && raw.from_email
      ? `${raw.from_name} <${raw.from_email}>`
      : raw.from_email || undefined

  const result = await sendEmail({
    to: raw.to_email,
    subject: raw.subject ?? '',
    html: raw.body,
    from: fromCombined,
    reply_to: raw.reply_to ?? undefined,
    internal_ref: raw.contact_id ?? raw.client_id ?? undefined,
  })

  if (!result.ok) {
    let status = 502
    if (result.code === 'ServiceUnconfigured') status = 503
    else if (result.code === 'InvalidInput') status = 400
    else if (result.code === 'NetworkError') status = 504
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        detail: result.detail,
        provider: 'resend',
        legacy_route: '/api/ghl/send-email',
      },
      { status, headers: deprecationHeaders() },
    )
  }

  // Shape-compatible legacy response (additional fields are additive ·
  // existing n8n callers ignore unknown keys).
  return NextResponse.json(
    {
      ok: true,
      message_id: result.message_id,
      to_email: raw.to_email,
      subject: raw.subject,
      queued_at: result.queued_at,
      fallback_mode: false, // canonical Resend send · NOT a stub anymore
      provider: 'resend',
      _deprecated: {
        sunset: SUNSET_DATE,
        successor: '/api/email/send',
        reason: 'Stack V4 GHL-Out migration',
      },
    },
    { status: 200, headers: deprecationHeaders() },
  )
}
