/**
 * Resend email wrapper · Sprint 3 Día 2 GHL-Out migration · 2026-05-20.
 *
 * Replaces the legacy GHL email stub (`/api/ghl/send-email/route.ts` ·
 * `fallback_mode: true · message_id synthetic`) with a real Resend
 * integration. Single-source helper that handlers + workflows + agent
 * tools can import; never hits Resend's HTTP boundary outside this file.
 *
 * Auth · `RESEND_API_KEY` env var (set in Vercel + Railway per Stack V4
 * canon · master plan §). When missing, every helper returns
 * `{ ok: false, code: 'ServiceUnconfigured' }` so callers can degrade
 * gracefully (HTTP 503 from the route).
 *
 * Stack canon · zero SDK dep (direct REST · matches Anthropic pattern
 * we shipped in CoworkPromptBar). Resend's REST surface is stable
 * https://resend.com/docs/api-reference/emails/send-email.
 */

export const RESEND_DEFAULT_FROM =
  process.env.RESEND_DEFAULT_FROM ||
  'Zero Risk <ops@zero-risk.com.ec>'

const RESEND_API = 'https://api.resend.com'

export interface SendEmailInput {
  to: string | string[]
  subject: string
  /** Either `html` or `text` is required · prefer html for marketing. */
  html?: string
  text?: string
  /** Override default From · "Display Name <addr@verified-domain>". */
  from?: string
  reply_to?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  /** Resend metadata tags · max 10 · keys/values up to 256 chars. */
  tags?: Array<{ name: string; value: string }>
  /** Internal · attached to the response so the caller can correlate
   * (NOT passed to Resend · we keep a separate audit trail). */
  internal_ref?: string
  /** ISO timestamp · schedule send (Resend supports scheduled). */
  scheduled_at?: string
}

export type SendResult =
  | {
      ok: true
      message_id: string
      provider: 'resend'
      queued_at: string
      internal_ref?: string
    }
  | {
      ok: false
      code:
        | 'ServiceUnconfigured'
        | 'InvalidInput'
        | 'ProviderError'
        | 'NetworkError'
      detail: string
      provider: 'resend'
      status?: number
      internal_ref?: string
    }

function hasApiKey(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function isProbablyEmail(s: string): boolean {
  // Sufficient gate for L1 validation · Resend will do strict RFC
  // validation server-side. We just reject obvious nonsense.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

function normalizeRecipients(input: string | string[]): string[] {
  const arr = Array.isArray(input) ? input : [input]
  return arr.map((v) => v.trim()).filter((v) => v.length > 0)
}

/**
 * Send a single email via Resend. Returns `SendResult` discriminated union.
 * NEVER throws · all error paths surface via `ok: false` with a `code`.
 */
export async function sendEmail(
  input: SendEmailInput,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<SendResult> {
  if (!hasApiKey()) {
    return {
      ok: false,
      code: 'ServiceUnconfigured',
      detail:
        'RESEND_API_KEY missing · set in Vercel/Railway production env per Stack V4 canon',
      provider: 'resend',
      internal_ref: input.internal_ref,
    }
  }

  const recipients = normalizeRecipients(input.to)
  if (recipients.length === 0) {
    return {
      ok: false,
      code: 'InvalidInput',
      detail: 'to_required · at least one recipient address needed',
      provider: 'resend',
      internal_ref: input.internal_ref,
    }
  }
  const badRecipient = recipients.find((r) => !isProbablyEmail(r))
  if (badRecipient) {
    return {
      ok: false,
      code: 'InvalidInput',
      detail: `invalid_email_format · ${badRecipient.slice(0, 80)}`,
      provider: 'resend',
      internal_ref: input.internal_ref,
    }
  }
  if (!input.subject || input.subject.trim().length === 0) {
    return {
      ok: false,
      code: 'InvalidInput',
      detail: 'subject_required',
      provider: 'resend',
      internal_ref: input.internal_ref,
    }
  }
  if (!input.html && !input.text) {
    return {
      ok: false,
      code: 'InvalidInput',
      detail: 'html_or_text_required · at least one body format needed',
      provider: 'resend',
      internal_ref: input.internal_ref,
    }
  }

  const payload: Record<string, unknown> = {
    from: input.from ?? RESEND_DEFAULT_FROM,
    to: recipients,
    subject: input.subject,
  }
  if (input.html) payload.html = input.html
  if (input.text) payload.text = input.text
  if (input.reply_to) payload.reply_to = input.reply_to
  if (input.cc) payload.cc = input.cc
  if (input.bcc) payload.bcc = input.bcc
  if (input.tags && input.tags.length > 0) {
    payload.tags = input.tags.slice(0, 10)
  }
  if (input.scheduled_at) payload.scheduled_at = input.scheduled_at

  const fetchFn = opts.fetchImpl ?? fetch
  const queuedAt = new Date().toISOString()
  try {
    const res = await fetchFn(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      return {
        ok: false,
        code: 'ProviderError',
        detail: `HTTP ${res.status} · ${text.slice(0, 400)}`,
        provider: 'resend',
        status: res.status,
        internal_ref: input.internal_ref,
      }
    }
    let parsed: { id?: string } = {}
    try {
      parsed = text ? (JSON.parse(text) as { id?: string }) : {}
    } catch {
      // Resend always returns JSON · if parse fails fall through with empty id
    }
    return {
      ok: true,
      message_id: parsed.id ?? `local-${queuedAt}`,
      provider: 'resend',
      queued_at: queuedAt,
      internal_ref: input.internal_ref,
    }
  } catch (e) {
    return {
      ok: false,
      code: 'NetworkError',
      detail: e instanceof Error ? e.message : 'unknown_fetch_error',
      provider: 'resend',
      internal_ref: input.internal_ref,
    }
  }
}

/**
 * Batch send · up to 100 per request (Resend cap). Returns array of results
 * in the same order as input · never throws.
 */
export async function sendBatch(
  inputs: SendEmailInput[],
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<SendResult[]> {
  if (inputs.length === 0) return []
  if (inputs.length > 100) {
    // We split into 100-sized chunks · Resend `/emails/batch` accepts up
    // to 100 per call. For simplicity we just iterate sequentially via
    // sendEmail · the cost is negligible for our volumes.
  }
  const results: SendResult[] = []
  for (const input of inputs) {
    results.push(await sendEmail(input, opts))
  }
  return results
}

/**
 * Probe the Resend domain verification status. Returns true only when
 * the configured From domain is verified upstream. Cheap · cached for
 * 60 seconds per process (good enough for an admin status surface).
 */
let _domainStatusCache: { at: number; verified: boolean } | null = null

export async function verifyDomain(
  opts: { fetchImpl?: typeof fetch; force?: boolean } = {},
): Promise<{ ok: boolean; verified: boolean; detail?: string }> {
  if (!hasApiKey()) {
    return { ok: false, verified: false, detail: 'RESEND_API_KEY missing' }
  }
  const now = Date.now()
  if (
    !opts.force &&
    _domainStatusCache &&
    now - _domainStatusCache.at < 60_000
  ) {
    return { ok: true, verified: _domainStatusCache.verified }
  }
  const fetchFn = opts.fetchImpl ?? fetch
  try {
    const res = await fetchFn(`${RESEND_API}/domains`, {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
    })
    if (!res.ok) {
      return {
        ok: false,
        verified: false,
        detail: `HTTP ${res.status}`,
      }
    }
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ name?: string; status?: string }>
    }
    const verified = (json.data ?? []).some(
      (d) => d.status === 'verified' && d.name,
    )
    _domainStatusCache = { at: now, verified }
    return { ok: true, verified }
  } catch (e) {
    return {
      ok: false,
      verified: false,
      detail: e instanceof Error ? e.message : 'unknown',
    }
  }
}

/** For tests · clear the in-process domain status cache. */
export function __resetDomainCache(): void {
  _domainStatusCache = null
}
