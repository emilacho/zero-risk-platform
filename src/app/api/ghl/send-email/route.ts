/**
 * POST /api/ghl/send-email — bridge to GHL email send.
 *
 * Closes W15-D-14. Workflow caller:
 *   `Zero Risk — Client NPS + CSAT Monthly Pulse (1st of Month 10am)`
 *
 * Purpose: send a transactional email via GoHighLevel. This is a stub bridge
 * for now — real GHL Email API integration is pending. The route DOES persist
 * every send attempt to ghl_email_log so audit + retry logic have a trail
 * even before the real upstream API is wired.
 *
 * Body (Ajv schema: ghl-send-email):
 *   {
 *     to_email: string (email format · required),
 *     subject: string (required),
 *     body: string (required · HTML or plain text),
 *     from_name?: string,
 *     from_email?: string,
 *     reply_to?: string,
 *     contact_id?: string,
 *     template_id?: string,
 *     client_id?: string,
 *     campaign_id?: string,
 *     metadata?: object
 *   }
 *
 * Response (200):
 *   {
 *     ok: true,
 *     message_id: string,        // local synthetic id; replaced by GHL's when wired
 *     to_email: string,
 *     subject: string,
 *     queued_at: ISO,
 *     fallback_mode: true,       // until real GHL API is wired
 *     persisted: boolean         // whether ghl_email_log insert succeeded
 *   }
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface SendEmailInput {
  to_email: string
  subject: string
  body: string
  from_name?: string | null
  from_email?: string | null
  reply_to?: string | null
  contact_id?: string | null
  template_id?: string | null
  client_id?: string | null
  campaign_id?: string | null
  metadata?: Record<string, unknown> | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400 },
    )
  }

  const v = validateObject<SendEmailInput>(raw, 'ghl-send-email')
  if (!v.ok) return v.response
  const body = v.data

  const messageId = `ghl-msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const queuedAt = new Date().toISOString()

  // Best-effort persist to ghl_email_log (table optional). We never fail the
  // request when persist fails — workflows depend on this returning ok so
  // they can chain to the next step.
  let persisted = false
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('ghl_email_log').insert({
      message_id: messageId,
      to_email: body.to_email,
      subject: body.subject.slice(0, 500),
      body_preview: body.body.slice(0, 1000),
      from_name: body.from_name ?? null,
      from_email: body.from_email ?? null,
      reply_to: body.reply_to ?? null,
      contact_id: body.contact_id ?? null,
      template_id: body.template_id ?? null,
      client_id: body.client_id ?? null,
      campaign_id: body.campaign_id ?? null,
      metadata: body.metadata ?? null,
      queued_at: queuedAt,
      status: 'queued_stub',
    })
    persisted = !error
  } catch {
    // Table missing or DB unavailable — keep going.
  }

  return NextResponse.json({
    ok: true,
    message_id: messageId,
    to_email: body.to_email,
    subject: body.subject,
    queued_at: queuedAt,
    fallback_mode: true,
    persisted,
    note: 'Stub: real GHL Email API integration pending. message_id is synthetic.',
  })
}
