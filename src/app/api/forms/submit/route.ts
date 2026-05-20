/**
 * /api/forms/submit · Sprint 4 · CC#2
 *
 * Public webhook for Tally form submissions. NO admin gate (third-party caller).
 * Verifies HMAC signature when TALLY_SIGNING_SECRET is set; otherwise accepts.
 *
 * Idempotency · (source, source_event_id) UNIQUE index dedupes Tally retries.
 *
 * Tally payload reference (2026)
 *   {
 *     eventId: "..."          · per-submission UUID
 *     eventType: "FORM_RESPONSE"
 *     formId: "..."           · Tally form ID (match to forms.tally_form_id)
 *     data: { fields: [{key,label,type,value}], ... }
 *   }
 */
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface TallyField {
  key?: string
  label?: string
  type?: string
  value?: unknown
}

function verifyTallySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function extractContactFields(fields: TallyField[] | undefined): {
  name: string | null
  email: string | null
  phone: string | null
  vertical: string | null
} {
  const out = { name: null as string | null, email: null as string | null, phone: null as string | null, vertical: null as string | null }
  if (!Array.isArray(fields)) return out
  for (const f of fields) {
    const key = (f.key || f.label || '').toLowerCase()
    const value = typeof f.value === 'string' ? f.value : f.value == null ? null : String(f.value)
    if (!value) continue
    if (!out.email && (key.includes('email') || f.type === 'INPUT_EMAIL')) out.email = value
    else if (!out.phone && (key.includes('phone') || key.includes('tel') || f.type === 'INPUT_PHONE_NUMBER')) out.phone = value
    else if (!out.name && (key.includes('name') || key === 'nombre')) out.name = value
    else if (!out.vertical && key.includes('vertical')) out.vertical = value
  }
  return out
}

export async function POST(request: Request) {
  const raw = await request.text()
  const signature =
    request.headers.get('tally-signature') ||
    request.headers.get('Tally-Signature') ||
    request.headers.get('x-tally-signature')

  const secret = process.env.TALLY_SIGNING_SECRET
  let signatureVerified = false
  if (secret) {
    if (!verifyTallySignature(raw, signature, secret)) {
      return NextResponse.json(
        { error: 'invalid_signature', code: 'E-FORMS-SUBMIT-SIG', detail: 'HMAC mismatch' },
        { status: 401 },
      )
    }
    signatureVerified = true
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'bad_request', code: 'E-FORMS-SUBMIT-JSON', detail: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const eventId = typeof payload.eventId === 'string' ? payload.eventId : null
  const tallyFormId = typeof payload.formId === 'string' ? payload.formId : null
  const data = (payload.data as Record<string, unknown> | undefined) ?? {}
  const fields = (data.fields as TallyField[] | undefined) ?? []
  const contactGuess = extractContactFields(fields)

  try {
    const supabase = getSupabaseAdmin()

    let formRowId: string | null = null
    if (tallyFormId) {
      const { data: formRow } = await supabase
        .from('forms')
        .select('id')
        .eq('tally_form_id', tallyFormId)
        .maybeSingle()
      formRowId = (formRow?.id as string | undefined) ?? null
    }

    const submissionRow = {
      form_id: formRowId,
      contact_id: null,
      payload,
      source: 'tally' as const,
      source_event_id: eventId,
      signature_verified: signatureVerified,
      processed_at: null,
    }

    const { data: inserted, error } = await supabase
      .from('form_submissions')
      .insert(submissionRow)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { ok: true, deduped: true, eventId },
          { status: 200 },
        )
      }
      return NextResponse.json(
        { error: 'db_error', code: 'E-FORMS-SUBMIT', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        submission_id: inserted.id,
        form_matched: Boolean(formRowId),
        signature_verified: signatureVerified,
        contact_hint: contactGuess,
      },
      { status: 201 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-FORMS-SUBMIT-EXC', detail: msg },
      { status: 500 },
    )
  }
}
