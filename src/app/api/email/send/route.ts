/**
 * POST /api/email/send · Sprint 3 Día 2 GHL-Out · 2026-05-20
 *
 * Canonical email send endpoint per Stack V4. Replaces the legacy
 * `/api/ghl/send-email` stub (preserved as a deprecated shim that
 * forwards to this route · sunset 2 weeks post-merge).
 *
 * Auth · tier 2 INTERNAL (x-api-key header).
 *
 * Body shape · superset of legacy GHL fields for migration ergonomics ·
 *   {
 *     to: string | string[],       // canonical · single or multiple
 *     to_email?: string,            // legacy alias · normalized to `to`
 *     subject: string,
 *     html?: string,                // preferred for marketing
 *     text?: string,                // plain text alternative
 *     body?: string,                // legacy alias · maps to html
 *     from?: string,                // override default · "Name <addr@domain>"
 *     from_name?: string,           // legacy · combined with from_email
 *     from_email?: string,          // legacy · combined with from_name
 *     reply_to?: string | string[],
 *     cc?: string | string[],
 *     bcc?: string | string[],
 *     tags?: Array<{name, value}>,
 *     scheduled_at?: ISO string,
 *     contact_id?: string,          // audit · persisted to email_events
 *     client_id?: string,           // audit · persisted to email_events
 *     campaign_id?: string,         // audit · persisted to email_events
 *     metadata?: object             // audit · persisted to email_events
 *   }
 *
 * Response (200 ok) · `{ ok, message_id, provider: "resend", queued_at, ... }`
 * Response (503 ServiceUnconfigured) · `{ ok: false, code, detail }` when
 *   RESEND_API_KEY env is missing (canon V4 caller should fall back).
 * Response (400 InvalidInput) · `{ ok: false, code, detail }` shape errors.
 * Response (502 ProviderError) · Resend upstream non-2xx.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendEmail, type SendEmailInput, type SendResult } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

interface LegacyAliases {
  to?: string | string[]
  to_email?: string
  subject?: string
  html?: string
  text?: string
  body?: string
  from?: string
  from_name?: string
  from_email?: string
  reply_to?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  tags?: Array<{ name: string; value: string }>
  scheduled_at?: string
  contact_id?: string
  client_id?: string
  campaign_id?: string
  metadata?: Record<string, unknown>
  internal_ref?: string
}

function normalizeBody(raw: LegacyAliases): {
  payload: SendEmailInput | null
  audit: Record<string, unknown>
  error?: string
} {
  const audit: Record<string, unknown> = {
    contact_id: raw.contact_id ?? null,
    client_id: raw.client_id ?? null,
    campaign_id: raw.campaign_id ?? null,
    metadata: raw.metadata ?? null,
  }
  const to = raw.to ?? raw.to_email
  if (!to) {
    return { payload: null, audit, error: 'to_or_to_email_required' }
  }
  let from = raw.from
  if (!from && (raw.from_name || raw.from_email)) {
    const name = raw.from_name?.trim()
    const email = raw.from_email?.trim()
    if (email) from = name ? `${name} <${email}>` : email
  }
  const html = raw.html ?? raw.body
  return {
    payload: {
      to,
      subject: raw.subject ?? '',
      html,
      text: raw.text,
      from,
      reply_to: raw.reply_to,
      cc: raw.cc,
      bcc: raw.bcc,
      tags: raw.tags,
      scheduled_at: raw.scheduled_at,
      internal_ref: raw.internal_ref,
    },
    audit,
  }
}

async function persistAuditEvent(args: {
  result: SendResult
  audit: Record<string, unknown>
  recipient: string | string[]
  subject: string
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('email_events').insert({
      provider: 'resend',
      message_id: args.result.ok ? args.result.message_id : null,
      to_email: Array.isArray(args.recipient) ? args.recipient.join(',') : args.recipient,
      subject: args.subject.slice(0, 500),
      status: args.result.ok ? 'queued' : 'failed',
      error_code: args.result.ok ? null : args.result.code,
      error_detail: args.result.ok ? null : args.result.detail.slice(0, 500),
      contact_id: args.audit.contact_id ?? null,
      client_id: args.audit.client_id ?? null,
      campaign_id: args.audit.campaign_id ?? null,
      metadata: args.audit.metadata ?? null,
      queued_at: args.result.ok ? args.result.queued_at : new Date().toISOString(),
    })
  } catch {
    // Best-effort audit · table may not exist yet (CC#3 migration Día 1).
    // The send itself is the source of truth · we never fail the request
    // because the audit row didn't land.
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthorized',
        code: 'E-AUTH-001',
        detail: auth.reason,
      },
      { status: 401 },
    )
  }

  let raw: LegacyAliases
  try {
    raw = (await request.json()) as LegacyAliases
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', code: 'E-EMAIL-JSON' },
      { status: 400 },
    )
  }

  const { payload, audit, error: normalizeErr } = normalizeBody(raw)
  if (normalizeErr || !payload) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_input',
        code: 'InvalidInput',
        detail: normalizeErr ?? 'unknown',
      },
      { status: 400 },
    )
  }

  const result = await sendEmail(payload)

  // Audit · always persist (best-effort) so failures are debuggable.
  await persistAuditEvent({
    result,
    audit,
    recipient: payload.to,
    subject: payload.subject,
  })

  if (!result.ok) {
    let status = 502
    if (result.code === 'ServiceUnconfigured') status = 503
    else if (result.code === 'InvalidInput') status = 400
    else if (result.code === 'NetworkError') status = 504
    return NextResponse.json(result, { status })
  }
  return NextResponse.json(result, { status: 200 })
}
