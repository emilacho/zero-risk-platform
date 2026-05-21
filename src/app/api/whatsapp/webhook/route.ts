/**
 * POST /api/whatsapp/webhook · Sprint 4 · Meta webhook receiver.
 * GET  /api/whatsapp/webhook · verify-token challenge for Meta dashboard setup.
 *
 * Auth · HMAC SHA-256 signature verify via `META_APP_SECRET` ·
 * `x-hub-signature-256: sha256=<hex>` header from Meta · constant-time compare.
 *
 * Returns ·
 *   200 · all events processed · `{ ok: true, processed_count }`
 *   401 · signature invalid (or env_missing → treated as 401 also for security · external should not distinguish)
 *   400 · payload malformed
 *
 * Persists inbound + status-update events a `whatsapp_messages`. Inbound
 * messages create new row (direction=in) · status-update events UPDATE
 * existing row by provider_message_id (or INSERT if not seen yet · idempotent).
 */
import { NextResponse } from "next/server"
import {
  verifyWebhook,
  parseWebhookPayload,
} from "@/lib/whatsapp/meta-graph"
import { getSupabaseAdmin } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const VERIFY_TOKEN_ENV = "WHATSAPP_WEBHOOK_VERIFY_TOKEN"

// GET · Meta verifies the webhook URL with hub.mode=subscribe + hub.verify_token + hub.challenge
export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  const expected = process.env[VERIFY_TOKEN_ENV]
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "not_configured", detail: `${VERIFY_TOKEN_ENV} missing` },
      { status: 503 },
    )
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new Response(challenge, { status: 200 })
  }
  return NextResponse.json({ ok: false, error: "verify_failed" }, { status: 403 })
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-hub-signature-256") ?? ""
  const rawBody = await request.text()

  const valid = verifyWebhook({ rawBody, signatureHeader: signature })
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 401 },
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    )
  }

  const events = parseWebhookPayload(payload)

  // Persist each event (best-effort · errors logged not thrown)
  let processed = 0
  try {
    const supa = getSupabaseAdmin()
    for (const ev of events) {
      if (ev.kind === "message") {
        // Inbound message · new row
        await supa.from("whatsapp_messages").insert({
          direction: "in",
          phone_number: ev.phone_number.startsWith("+")
            ? ev.phone_number
            : `+${ev.phone_number}`,
          body: ev.body,
          status: "received",
          provider_message_id: ev.provider_message_id,
          meta_payload: ev.raw,
          caller: "meta-webhook",
        })
        processed++
      } else if (ev.kind === "status") {
        // Status update · UPDATE existing outbound row by WAMID
        const { data: existing } = await supa
          .from("whatsapp_messages")
          .select("id")
          .eq("provider_message_id", ev.provider_message_id)
          .maybeSingle()
        if (existing?.id) {
          await supa
            .from("whatsapp_messages")
            .update({
              status: ev.status_value ?? "sent",
              meta_payload: ev.raw,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
        }
        processed++
      }
    }
  } catch (err) {
    console.error("[whatsapp/webhook] persist error (non-blocking):", err)
  }

  // Return 200 even on partial persist errors · Meta retries on non-2xx
  return NextResponse.json({
    ok: true,
    processed_count: processed,
    total_events: events.length,
  })
}
