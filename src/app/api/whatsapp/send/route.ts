/**
 * POST /api/whatsapp/send · Sprint 4 · outbound WhatsApp.
 *
 * Auth · INTERNAL_API_KEY (canonical pattern · matches sms/send + meta-ads/*).
 *
 * Body · either template OR free text (reply window 24h Meta rule) ·
 *   { to: "+E164", template_name: "name", language?: "es", variables?: ["..."] }
 *   { to: "+E164", text_body: "..." }
 *
 * Returns ·
 *   200 · `{ ok: true, provider_message_id, to, kind }`
 *   401 · auth fails
 *   400 · invalid phone OR invalid input
 *   429 · Meta rate limited
 *   503 · env vars missing
 *   502 · Meta upstream error
 *
 * Persists row a `whatsapp_messages` con direction=out · status=sent
 * (on success) or status=failed (on provider error).
 */
import { NextResponse } from "next/server"
import { checkInternalKey } from "@/lib/internal-auth"
import { sendTemplate, sendText } from "@/lib/whatsapp/meta-graph"
import { getSupabaseAdmin } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 30

type SendBody = {
  to?: string
  template_name?: string
  language?: string
  variables?: string[]
  text_body?: string
  contact_id?: string | null
  caller?: string
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: auth.reason },
      { status: 401 },
    )
  }

  let body: SendBody
  try {
    body = (await request.json()) as SendBody
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", code: "E-WAB-JSON" },
      { status: 400 },
    )
  }

  if (!body.to) {
    return NextResponse.json(
      { ok: false, error: "to required (E.164)", code: "E-WAB-TO" },
      { status: 400 },
    )
  }
  if (!body.template_name && !body.text_body) {
    return NextResponse.json(
      {
        ok: false,
        error: "template_name OR text_body required",
        code: "E-WAB-PAYLOAD",
      },
      { status: 400 },
    )
  }

  const result = body.template_name
    ? await sendTemplate({
        to: body.to,
        template_name: body.template_name,
        language: body.language,
        variables: body.variables,
      })
    : await sendText({
        to: body.to,
        text_body: body.text_body!,
      })

  // Persist log row (best-effort · don't block response on DB write error)
  try {
    const supa = getSupabaseAdmin()
    await supa.from("whatsapp_messages").insert({
      direction: "out",
      contact_id: body.contact_id ?? null,
      phone_number: body.to,
      template_name: body.template_name ?? null,
      body: body.text_body ?? null,
      status: result.ok ? "sent" : "failed",
      provider_message_id: result.ok ? result.provider_message_id : null,
      meta_payload: result.ok
        ? { kind: result.kind, variables: body.variables ?? [] }
        : { code: result.code, detail: result.detail },
      error_code: result.ok ? null : result.code,
      error_detail: result.ok ? null : result.detail,
      caller: body.caller ?? "n8n-whatsapp-send",
    })
  } catch (err) {
    console.error("[whatsapp/send] insert log row failed:", err)
  }

  if (result.ok) return NextResponse.json(result)

  switch (result.code) {
    case "env_missing":
      return NextResponse.json(
        { ok: false, error: "not_configured", detail: result.detail },
        { status: 503 },
      )
    case "invalid_phone":
    case "invalid_input":
      return NextResponse.json(result, { status: 400 })
    case "rate_limited":
      return NextResponse.json(result, { status: 429 })
    case "provider_error":
    case "fetch_error":
    default:
      return NextResponse.json(result, { status: 502 })
  }
}
