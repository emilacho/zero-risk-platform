/**
 * POST /api/forms/submit · Sprint 6 Track C3 · Tally webhook target.
 *
 * Auth · HMAC SHA-256 signature via `TALLY_SIGNING_SECRET` (env) +
 * `tally-signature` header. 401 sin secret OR signature mismatch.
 *
 * Persists ·
 *   1. Row a `form_submissions` (canonical PR #59 CC#2 schema · expected
 *      columns · id · form_id · response_id · raw_payload jsonb ·
 *      created_at)
 *   2. UPSERT a `client_champions` (auto-create contact si email present ·
 *      idempotent por email)
 *
 * Returns 200 always on valid signature · webhook canonical idempotency ·
 * Tally retries on non-2xx. Errors persisted as `processing_errors` JSONB
 * in form_submissions for audit.
 *
 * Smoke probe · vault playbook
 * `zr-vault/wiki/playbooks/tally-form-canonical-setup.md`.
 */
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import {
  verifyTallyWebhook,
  extractCanonicalFields,
  type TallyWebhookPayload,
} from "@/lib/forms/tally-webhook"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(request: Request) {
  // Read raw body BEFORE parse · HMAC needs exact bytes
  const rawBody = await request.text()
  const signatureHeader = request.headers.get("tally-signature") ?? ""

  // 503 if env unset · canonical graceful degradation (Tally will retry but
  // we surface the gap clearly in logs vs silently accepting unsigned posts)
  if (!process.env.TALLY_SIGNING_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        error: "not_configured",
        detail: "TALLY_SIGNING_SECRET env var missing · webhook cannot verify",
      },
      { status: 503 },
    )
  }

  const valid = verifyTallyWebhook({ rawBody, signatureHeader })
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 401 },
    )
  }

  let payload: TallyWebhookPayload
  try {
    payload = JSON.parse(rawBody) as TallyWebhookPayload
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    )
  }

  const extracted = extractCanonicalFields(payload)
  const responseId =
    payload.responseId ?? payload.data?.responseId ?? payload.data?.submissionId ?? null
  const formId = payload.formId ?? payload.data?.formId ?? null

  const supa = getSupabaseAdmin()
  const errors: string[] = []

  // 1 · INSERT form_submissions row
  let submissionId: string | null = null
  try {
    const { data, error } = await supa
      .from("form_submissions")
      .insert({
        form_id: formId,
        response_id: responseId,
        raw_payload: payload,
        extracted_fields: extracted,
        source: "tally-webhook",
      })
      .select("id")
      .single()
    if (error) errors.push(`form_submissions_insert: ${error.message}`)
    else submissionId = (data as { id: string } | null)?.id ?? null
  } catch (err) {
    errors.push(
      `form_submissions_insert_exception: ${err instanceof Error ? err.message : "unknown"}`,
    )
  }

  // 2 · Auto-create client_champions row si email present
  let championId: string | null = null
  if (extracted.email) {
    try {
      const { data, error } = await supa
        .from("client_champions")
        .upsert(
          {
            name: extracted.name ?? "Unknown",
            email: extracted.email,
            phone: extracted.phone,
            is_primary: true,
            source: "tally-form-submit",
            extracted_at: new Date().toISOString(),
          },
          { onConflict: "email" },
        )
        .select("id")
        .single()
      if (error) errors.push(`client_champions_upsert: ${error.message}`)
      else championId = (data as { id: string } | null)?.id ?? null
    } catch (err) {
      errors.push(
        `client_champions_upsert_exception: ${err instanceof Error ? err.message : "unknown"}`,
      )
    }
  }

  return NextResponse.json({
    ok: true,
    submission_id: submissionId,
    champion_id: championId,
    extracted_fields: extracted,
    response_id: responseId,
    form_id: formId,
    processing_errors: errors.length > 0 ? errors : null,
  })
}

/** Diagnostic GET · returns canonical setup hints (Tally cannot GET) */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/forms/submit",
    method: "POST",
    auth: "HMAC SHA-256 via `tally-signature` header + TALLY_SIGNING_SECRET env",
    setup_docs:
      "zr-vault/wiki/playbooks/tally-form-canonical-setup.md",
    env_required: ["TALLY_SIGNING_SECRET"],
    canonical_fields: [
      "name",
      "email",
      "phone",
      "vertical",
      "journey_type",
      "brand_book_url",
    ],
  })
}
