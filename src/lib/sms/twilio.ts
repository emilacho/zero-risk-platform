/**
 * Twilio SMS wrapper · Sprint #3 Día 3.
 *
 * Direct Twilio REST API call · NO `twilio` SDK install (matches the
 * Meta Ads + Meta Social pattern · fetch-based wrappers · less bundle
 * weight · zero new deps). Graceful degradation · returns
 * `{ ok: false, code: 'env_missing' }` when any of the 3 required env
 * vars is missing so callers can route to fallback channels (email · MC
 * inbox · Slack) without throwing.
 *
 * Required env (Vercel project) · all 3 must be set for live SMS ·
 *   - TWILIO_ACCOUNT_SID    · starts with `AC...`
 *   - TWILIO_AUTH_TOKEN     · 32-char hex
 *   - TWILIO_PHONE_NUMBER   · E.164 format · `+1234567890`
 *
 * Caller pattern · `sendSms({ to, body })` · `from` defaults to env
 * `TWILIO_PHONE_NUMBER` · caller can override per-message for sub-account
 * messaging service IDs (e.g. cliente-specific sender phone).
 *
 * Rate limit · 1 SMS/sec per phone per Twilio default · 429 response from
 * Twilio is surfaced as `{ ok: false, code: 'rate_limited' }` so caller
 * can retry-with-backoff.
 */

export interface SendSmsInput {
  /** Recipient phone number · E.164 format · `+1234567890` */
  to: string
  /** Message body · max 1600 chars total (Twilio splits into segments at 160) */
  body: string
  /** Sender phone · defaults to TWILIO_PHONE_NUMBER · override for messaging services */
  from?: string
}

export type SendSmsResult =
  | {
      ok: true
      sid: string
      to: string
      from: string
      status: string
      segments: number
      cost_estimate_usd: number
    }
  | {
      ok: false
      code:
        | "env_missing"
        | "invalid_phone"
        | "invalid_body"
        | "rate_limited"
        | "twilio_error"
        | "fetch_error"
      detail: string
      status?: number
    }

// E.164 phone validation · canonical lite (Twilio rejects more strictly server-side)
const E164_RE = /^\+[1-9]\d{1,14}$/

// Cost per segment (US baseline · adjust per destination country in caller)
const COST_PER_SEGMENT_USD = 0.0079

function segmentCount(body: string): number {
  if (body.length <= 160) return 1
  return Math.ceil(body.length / 153) // GSM-7 multi-segment encoding
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const defaultFrom = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !defaultFrom) {
    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !authToken && "TWILIO_AUTH_TOKEN",
      !defaultFrom && "TWILIO_PHONE_NUMBER",
    ]
      .filter(Boolean)
      .join(", ")
    return {
      ok: false,
      code: "env_missing",
      detail: `Twilio env vars missing · ${missing}`,
    }
  }

  if (!input.to || !E164_RE.test(input.to)) {
    return {
      ok: false,
      code: "invalid_phone",
      detail: `to must be E.164 format · got "${input.to}"`,
    }
  }
  if (!input.body || input.body.length === 0) {
    return {
      ok: false,
      code: "invalid_body",
      detail: "body required · non-empty string",
    }
  }
  if (input.body.length > 1600) {
    return {
      ok: false,
      code: "invalid_body",
      detail: `body exceeds 1600 char Twilio cap · got ${input.body.length}`,
    }
  }

  const from = input.from || defaultFrom
  if (!E164_RE.test(from)) {
    return {
      ok: false,
      code: "invalid_phone",
      detail: `from must be E.164 format · got "${from}"`,
    }
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64")
  const params = new URLSearchParams({
    To: input.to,
    From: from,
    Body: input.body,
  })

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    })

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string
      status?: string
      error_code?: number
      message?: string
    }

    if (res.status === 429) {
      return {
        ok: false,
        code: "rate_limited",
        detail: "Twilio 429 · retry with exponential backoff",
        status: 429,
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        code: "twilio_error",
        detail:
          data.message ??
          `Twilio HTTP ${res.status} · error_code ${data.error_code ?? "?"}`,
        status: res.status,
      }
    }

    const segments = segmentCount(input.body)
    return {
      ok: true,
      sid: data.sid ?? "",
      to: input.to,
      from,
      status: data.status ?? "queued",
      segments,
      cost_estimate_usd: segments * COST_PER_SEGMENT_USD,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return {
      ok: false,
      code: "fetch_error",
      detail: msg.slice(0, 500),
    }
  }
}
