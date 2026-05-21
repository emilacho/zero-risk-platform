/**
 * /api/forms/submit · Sprint 5 wire-in · CC#2
 *
 * Tally webhook handler · HMAC verify · persist submission · extract contact
 * fields · INSERT client_champions (when sufficient data) · dispatch L1
 * ONBOARD journey via journey-orchestrator · mark form_submissions.processed_at.
 *
 * Per Sprint 5 wire-in dispatch (vault `2026-05-20-cc2-sprint5-forms-landings-wire-in.md`)
 * + canonical schema decision (vault `2026-05-20-tally-form-fields-canonical-schema.md`).
 *
 * Flow ·
 *   1. HMAC verify (when TALLY_SIGNING_SECRET set · 401 on mismatch)
 *   2. Parse payload · extract eventId · tallyFormId · fields[]
 *   3. Resolve formRowId via tally_form_id lookup
 *   4. INSERT form_submissions (idempotent on source+source_event_id)
 *   5. Extract canonical 6 fields · if email + name present, INSERT client_champions
 *   6. dispatchJourney({journey: ONBOARD or extracted, trigger_type: webhook, ...})
 *   7. UPDATE form_submissions · processed_at + contact_id + journey_id metadata
 *   8. Return 201 with submission_id + journey_id
 *
 * Idempotency · 23505 on insert → 200 deduped · NO double dispatch.
 * L1 dispatch failure · 200 with warning · submission STILL persisted · audit trail intact.
 */
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { dispatchJourney } from '@/lib/journey-orchestrator/dispatch'
import type { JourneyType } from '@/lib/journey-orchestrator/types'
import { JOURNEY_TYPES } from '@/lib/journey-orchestrator/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface TallyField {
  key?: string
  label?: string
  type?: string
  value?: unknown
}

interface CanonicalContact {
  name: string | null
  email: string | null
  phone: string | null
  vertical: string | null
  journey_type: JourneyType | null
  brand_book_url: string | null
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

function extractCanonicalContact(fields: TallyField[] | undefined): CanonicalContact {
  const out: CanonicalContact = {
    name: null,
    email: null,
    phone: null,
    vertical: null,
    journey_type: null,
    brand_book_url: null,
  }
  if (!Array.isArray(fields)) return out
  for (const f of fields) {
    const key = (f.key || f.label || '').toLowerCase()
    const value = typeof f.value === 'string' ? f.value : f.value == null ? null : String(f.value)
    if (!value) continue
    if (!out.email && (key.includes('email') || f.type === 'INPUT_EMAIL')) out.email = value
    else if (!out.phone && (key.includes('phone') || key.includes('tel') || f.type === 'INPUT_PHONE_NUMBER')) out.phone = value
    else if (!out.name && (key.includes('name') || key === 'nombre')) out.name = value
    else if (!out.vertical && key.includes('vertical')) out.vertical = value
    else if (!out.brand_book_url && key.includes('brand_book')) out.brand_book_url = value
    else if (!out.journey_type && (key.includes('journey_type') || key === 'journey')) {
      const upper = value.toUpperCase()
      if ((JOURNEY_TYPES as readonly string[]).includes(upper)) {
        out.journey_type = upper as JourneyType
      }
    }
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
  const contact = extractCanonicalContact(fields)

  try {
    const supabase = getSupabaseAdmin()

    // 1. Resolve form_id via tally_form_id
    let formRowId: string | null = null
    if (tallyFormId) {
      const { data: formRow } = await supabase
        .from('forms')
        .select('id')
        .eq('tally_form_id', tallyFormId)
        .maybeSingle()
      formRowId = (formRow?.id as string | undefined) ?? null
    }

    // 2. INSERT form_submissions
    const { data: inserted, error: insertError } = await supabase
      .from('form_submissions')
      .insert({
        form_id: formRowId,
        contact_id: null,
        payload,
        source: 'tally' as const,
        source_event_id: eventId,
        signature_verified: signatureVerified,
        processed_at: null,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ ok: true, deduped: true, eventId }, { status: 200 })
      }
      return NextResponse.json(
        { error: 'db_error', code: 'E-FORMS-SUBMIT', detail: insertError.message },
        { status: 500 },
      )
    }

    // 3. If sufficient contact data · INSERT client_champions + dispatch L1 journey
    const canDispatch = Boolean(contact.email && contact.name)
    let championRow: { id: string; client_id: string | null } | null = null
    let dispatchResult: { ok: boolean; journey_id?: string; dispatch_status?: string; error?: string } | null = null

    if (canDispatch) {
      // 3a. INSERT champion (single-tenant · client_id null pre-onboarding)
      const { data: champion, error: championError } = await supabase
        .from('client_champions')
        .insert({
          client_id: null,
          champion_name: contact.name,
          champion_email: contact.email,
          champion_phone: contact.phone,
          relationship_strength: 'medium',
          influence_level: 'medium',
          metadata: {
            source: 'tally_form_submission',
            form_id: formRowId,
            submission_id: inserted.id,
            tally_form_id: tallyFormId,
            tally_event_id: eventId,
            vertical: contact.vertical,
            brand_book_url: contact.brand_book_url,
          },
        })
        .select('id, client_id')
        .single()

      if (championError) {
        // Non-fatal · submission still persisted · log error in metadata
        await supabase
          .from('form_submissions')
          .update({
            processing_error: `champion_insert_failed: ${championError.message.slice(0, 200)}`,
            processed_at: new Date().toISOString(),
          })
          .eq('id', inserted.id)
      } else {
        championRow = champion as { id: string; client_id: string | null }

        // 3b. Dispatch L1 journey
        const journey: JourneyType = contact.journey_type ?? 'ONBOARD'
        try {
          dispatchResult = await dispatchJourney({
            client_id: championRow.client_id,
            journey,
            trigger_type: 'webhook',
            trigger_source: 'tally_form_submission',
            params: {
              form_id: formRowId,
              submission_id: inserted.id,
              champion_id: championRow.id,
              brand_book_url: contact.brand_book_url,
              contact_email: contact.email,
              contact_name: contact.name,
              contact_phone: contact.phone,
              vertical: contact.vertical,
              tally_event_id: eventId,
            },
          })
        } catch (e) {
          dispatchResult = {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          }
        }

        // 3c. UPDATE submission · processed_at + contact_id + dispatch result
        await supabase
          .from('form_submissions')
          .update({
            contact_id: championRow.id,
            processed_at: new Date().toISOString(),
            processing_error: dispatchResult?.ok === false
              ? `journey_dispatch_failed: ${(dispatchResult.error ?? 'unknown').slice(0, 200)}`
              : null,
          })
          .eq('id', inserted.id)
      }
    } else {
      // Contact data insufficient · mark processed but no dispatch
      await supabase
        .from('form_submissions')
        .update({
          processed_at: new Date().toISOString(),
          processing_error: 'insufficient_contact_data · email + name required for L1 dispatch',
        })
        .eq('id', inserted.id)
    }

    return NextResponse.json(
      {
        ok: true,
        submission_id: inserted.id,
        form_matched: Boolean(formRowId),
        signature_verified: signatureVerified,
        champion_id: championRow?.id ?? null,
        journey_dispatched: dispatchResult?.ok ?? false,
        journey_id: dispatchResult?.journey_id ?? null,
        dispatch_status: dispatchResult?.dispatch_status ?? (canDispatch ? 'attempted' : 'skipped_insufficient_data'),
        contact_hint: contact,
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
