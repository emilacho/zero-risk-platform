/**
 * POST /api/sms/send · Sprint #3 Día 3 · Twilio SMS endpoint.
 *
 * Auth · `x-api-key: INTERNAL_API_KEY` (same pattern as meta-ads/meta-social).
 *
 * Body:
 *   { to: string (E.164), body: string, from?: string }
 *
 * Returns ·
 *   200 · `{ ok: true, sid, to, from, status, segments, cost_estimate_usd }`
 *   401 · auth fails
 *   400 · invalid phone OR invalid body
 *   429 · Twilio rate limited (retry with backoff at caller)
 *   503 · env vars missing (TWILIO_ACCOUNT_SID + AUTH_TOKEN + PHONE_NUMBER)
 *   502 · Twilio upstream error
 *
 * Graceful degradation · when env missing returns 503 NOT 500 · caller can
 * route to fallback channel (email · MC inbox · Slack DM) instead of
 * failing the entire workflow.
 */
import { NextResponse } from "next/server"
import { checkInternalKey } from "@/lib/internal-auth"
import { sendSms } from "@/lib/sms/twilio"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: auth.reason },
      { status: 401 },
    )
  }

  let body: { to?: string; body?: string; from?: string }
  try {
    body = (await request.json()) as { to?: string; body?: string; from?: string }
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", code: "E-SMS-JSON" },
      { status: 400 },
    )
  }

  if (!body.to) {
    return NextResponse.json(
      { ok: false, error: "to required (E.164 format)", code: "E-SMS-TO" },
      { status: 400 },
    )
  }
  if (!body.body) {
    return NextResponse.json(
      { ok: false, error: "body required", code: "E-SMS-BODY" },
      { status: 400 },
    )
  }

  const result = await sendSms({
    to: body.to,
    body: body.body,
    from: body.from,
  })

  if (result.ok) {
    return NextResponse.json(result)
  }

  // Map wrapper error codes to HTTP status
  switch (result.code) {
    case "env_missing":
      return NextResponse.json(
        { ok: false, error: "not_configured", detail: result.detail },
        { status: 503 },
      )
    case "invalid_phone":
    case "invalid_body":
      return NextResponse.json(result, { status: 400 })
    case "rate_limited":
      return NextResponse.json(result, { status: 429 })
    case "twilio_error":
      return NextResponse.json(result, { status: 502 })
    case "fetch_error":
    default:
      return NextResponse.json(result, { status: 502 })
  }
}
