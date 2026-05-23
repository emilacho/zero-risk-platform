/**
 * WhatsApp Business · Meta Cloud API v21 wrapper · Sprint 4.
 *
 * SDK-less REST · pattern idéntico al Twilio SMS wrapper PR #55. Direct
 * `graph.facebook.com/v21.0/<phone_number_id>/messages` calls · no
 * `whatsapp-cloud-api` SDK install (0 new deps).
 *
 * Per decision `zr-vault/wiki/decisions/2026-05-20-whatsapp-meta-graph-direct-vs-twilio.md`
 * · save ~40% per message vs Twilio markup · stack-aligned con Brazo 3 +
 * Social Camino B (decision hermana).
 *
 * Required env (Vercel project) ·
 *   - WHATSAPP_PHONE_NUMBER_ID  · Meta Business phone number ID
 *   - WHATSAPP_ACCESS_TOKEN     · system user permanent token (no expiry)
 *                                 Fallback chain · WHATSAPP_ACCESS_TOKEN →
 *                                 META_SYSTEM_USER_TOKEN → META_ACCESS_TOKEN.
 *                                 Meta system user tokens granted the
 *                                 whatsapp_business_messaging permission work
 *                                 against the WABA, so re-using the existing
 *                                 META_SYSTEM_USER_TOKEN avoids populating a
 *                                 separate WhatsApp-only token.
 *   - META_APP_SECRET           · HMAC verify webhook signatures
 *
 * Never throws · discriminated union SendResult per Twilio pattern.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

const GRAPH_BASE = "https://graph.facebook.com/v21.0"

// E.164 phone validation · canonical lite (Meta rejects more strictly server-side)
const E164_RE = /^\+[1-9]\d{1,14}$/

export interface SendTemplateInput {
  /** Recipient phone · E.164 format · `+593987654321` */
  to: string
  /** Template name approved en Meta Business Manager */
  template_name: string
  /** Language code · `es` · `en_US` · etc · default `es` */
  language?: string
  /** Body parameters in order · positional replacement {{1}}, {{2}}, ... */
  variables?: string[]
}

export interface SendTextInput {
  /** Recipient phone · E.164 format */
  to: string
  /** Free text body · MUST be inside 24h reply window (Meta rule) · max 4096 chars */
  text_body: string
}

export type SendResult =
  | {
      ok: true
      provider_message_id: string
      to: string
      kind: "template" | "text"
    }
  | {
      ok: false
      code:
        | "env_missing"
        | "invalid_phone"
        | "invalid_input"
        | "rate_limited"
        | "provider_error"
        | "fetch_error"
      detail: string
      status?: number
      meta_error_code?: number
    }

function resolveAccessToken(): string | undefined {
  return (
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.META_SYSTEM_USER_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    undefined
  )
}

function envOrNull(): {
  phoneId: string
  token: string
  appSecret: string
} | null {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = resolveAccessToken()
  const appSecret = process.env.META_APP_SECRET
  if (!phoneId || !token || !appSecret) return null
  return { phoneId, token, appSecret }
}

function missingEnvDetail(): string {
  const missing = [
    !process.env.WHATSAPP_PHONE_NUMBER_ID && "WHATSAPP_PHONE_NUMBER_ID",
    !resolveAccessToken() &&
      "WHATSAPP_ACCESS_TOKEN (or META_SYSTEM_USER_TOKEN · META_ACCESS_TOKEN fallback)",
    !process.env.META_APP_SECRET && "META_APP_SECRET",
  ]
    .filter(Boolean)
    .join(", ")
  return `WhatsApp env vars missing · ${missing}`
}

async function callMetaGraph(
  url: string,
  body: Record<string, unknown>,
  token: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, data }
}

function mapMetaError(
  status: number,
  data: Record<string, unknown>,
): Extract<SendResult, { ok: false }> {
  const err = (data?.error ?? {}) as {
    message?: string
    code?: number
    type?: string
  }
  if (status === 429 || err.code === 80007 || err.code === 4) {
    return {
      ok: false,
      code: "rate_limited",
      detail: err.message ?? "Meta 429 · retry with exponential backoff",
      status: 429,
      meta_error_code: err.code,
    }
  }
  return {
    ok: false,
    code: "provider_error",
    detail: err.message ?? `Meta HTTP ${status}`,
    status,
    meta_error_code: err.code,
  }
}

// ─── sendTemplate ───────────────────────────────────────────────────────

export async function sendTemplate(input: SendTemplateInput): Promise<SendResult> {
  const env = envOrNull()
  if (!env) {
    return { ok: false, code: "env_missing", detail: missingEnvDetail() }
  }
  if (!input.to || !E164_RE.test(input.to)) {
    return {
      ok: false,
      code: "invalid_phone",
      detail: `to must be E.164 format · got "${input.to}"`,
    }
  }
  if (!input.template_name || input.template_name.length === 0) {
    return {
      ok: false,
      code: "invalid_input",
      detail: "template_name required · non-empty string",
    }
  }

  const language = input.language ?? "es"
  const variables = input.variables ?? []

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: input.to.replace(/^\+/, ""), // Meta wants no leading +
    type: "template",
    template: {
      name: input.template_name,
      language: { code: language },
      ...(variables.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: variables.map((v) => ({
                  type: "text",
                  text: v,
                })),
              },
            ],
          }
        : {}),
    },
  }

  try {
    const url = `${GRAPH_BASE}/${env.phoneId}/messages`
    const { status, data } = await callMetaGraph(url, body, env.token)

    if (status >= 200 && status < 300) {
      const messages = (data.messages ?? []) as Array<{ id?: string }>
      return {
        ok: true,
        provider_message_id: messages[0]?.id ?? "",
        to: input.to,
        kind: "template",
      }
    }
    return mapMetaError(status, data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return { ok: false, code: "fetch_error", detail: msg.slice(0, 500) }
  }
}

// ─── sendText ───────────────────────────────────────────────────────────

export async function sendText(input: SendTextInput): Promise<SendResult> {
  const env = envOrNull()
  if (!env) {
    return { ok: false, code: "env_missing", detail: missingEnvDetail() }
  }
  if (!input.to || !E164_RE.test(input.to)) {
    return {
      ok: false,
      code: "invalid_phone",
      detail: `to must be E.164 format · got "${input.to}"`,
    }
  }
  if (!input.text_body || input.text_body.length === 0) {
    return {
      ok: false,
      code: "invalid_input",
      detail: "text_body required · non-empty string",
    }
  }
  if (input.text_body.length > 4096) {
    return {
      ok: false,
      code: "invalid_input",
      detail: `text_body exceeds 4096 char Meta cap · got ${input.text_body.length}`,
    }
  }

  const body = {
    messaging_product: "whatsapp",
    to: input.to.replace(/^\+/, ""),
    type: "text",
    text: { body: input.text_body },
  }

  try {
    const url = `${GRAPH_BASE}/${env.phoneId}/messages`
    const { status, data } = await callMetaGraph(url, body, env.token)

    if (status >= 200 && status < 300) {
      const messages = (data.messages ?? []) as Array<{ id?: string }>
      return {
        ok: true,
        provider_message_id: messages[0]?.id ?? "",
        to: input.to,
        kind: "text",
      }
    }
    return mapMetaError(status, data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return { ok: false, code: "fetch_error", detail: msg.slice(0, 500) }
  }
}

// ─── listTemplates ──────────────────────────────────────────────────────

export interface TemplateInfo {
  name: string
  language: string
  status: string
  category: string
}

export type TemplatesResult =
  | { ok: true; templates: TemplateInfo[] }
  | { ok: false; code: "env_missing" | "provider_error" | "fetch_error"; detail: string }

export async function listTemplates(
  businessAccountId?: string,
): Promise<TemplatesResult> {
  const env = envOrNull()
  if (!env) {
    return { ok: false, code: "env_missing", detail: missingEnvDetail() }
  }
  const wabaId = businessAccountId ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  if (!wabaId) {
    return {
      ok: false,
      code: "env_missing",
      detail: "WHATSAPP_BUSINESS_ACCOUNT_ID env or businessAccountId arg required",
    }
  }

  try {
    const url = `${GRAPH_BASE}/${wabaId}/message_templates?limit=100`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await res.json().catch(() => ({}))) as {
      data?: Array<{
        name: string
        language: string
        status: string
        category: string
      }>
      error?: { message?: string; code?: number }
    }

    if (!res.ok) {
      return {
        ok: false,
        code: "provider_error",
        detail:
          data.error?.message ?? `Meta HTTP ${res.status} listing templates`,
      }
    }

    return {
      ok: true,
      templates: (data.data ?? []).map((t) => ({
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category,
      })),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return { ok: false, code: "fetch_error", detail: msg.slice(0, 500) }
  }
}

// ─── HMAC webhook signature verification ────────────────────────────────

export interface VerifyWebhookInput {
  /** Raw request body string · MUST be the exact bytes Meta sent (not parsed-and-restringified) */
  rawBody: string
  /** Value of `x-hub-signature-256` header from Meta · format `sha256=<hex>` */
  signatureHeader: string
}

/**
 * Verify Meta webhook HMAC signature · constant-time comparison.
 * Returns `true` only if signature is valid + env configured.
 */
export function verifyWebhook(input: VerifyWebhookInput): boolean {
  const env = envOrNull()
  if (!env) return false

  if (!input.signatureHeader || !input.signatureHeader.startsWith("sha256=")) {
    return false
  }
  const expectedHex = input.signatureHeader.slice("sha256=".length)
  if (expectedHex.length !== 64) return false

  const hmac = createHmac("sha256", env.appSecret)
  hmac.update(input.rawBody)
  const actualHex = hmac.digest("hex")

  if (actualHex.length !== expectedHex.length) return false

  try {
    return timingSafeEqual(Buffer.from(expectedHex), Buffer.from(actualHex))
  } catch {
    return false
  }
}

// ─── Webhook payload parsing ────────────────────────────────────────────

export interface WebhookEvent {
  /** Phone number sender (inbound message) OR recipient (outbound status) */
  phone_number: string
  /** Meta WAMID */
  provider_message_id: string
  /** event type · `message` (inbound text/template reply) OR `status` (delivery update) */
  kind: "message" | "status"
  /** For inbound · body text · for status · null */
  body: string | null
  /** For status · new status value · for inbound · null */
  status_value: string | null
  /** Raw event payload for audit trail */
  raw: Record<string, unknown>
}

/**
 * Parse Meta webhook POST body into a flat list of events.
 * Meta sends batched payloads · we surface one record per entry.
 */
export function parseWebhookPayload(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const out: WebhookEvent[] = []
  const entries = (payload.entry ?? []) as Array<Record<string, unknown>>

  for (const entry of entries) {
    const changes = (entry.changes ?? []) as Array<Record<string, unknown>>
    for (const change of changes) {
      const value = (change.value ?? {}) as Record<string, unknown>

      // Inbound messages
      const messages = (value.messages ?? []) as Array<{
        from?: string
        id?: string
        text?: { body?: string }
      }>
      for (const m of messages) {
        out.push({
          phone_number: m.from ?? "",
          provider_message_id: m.id ?? "",
          kind: "message",
          body: m.text?.body ?? null,
          status_value: null,
          raw: { ...m, _entry_id: entry.id },
        })
      }

      // Status updates
      const statuses = (value.statuses ?? []) as Array<{
        recipient_id?: string
        id?: string
        status?: string
      }>
      for (const s of statuses) {
        out.push({
          phone_number: s.recipient_id ?? "",
          provider_message_id: s.id ?? "",
          kind: "status",
          body: null,
          status_value: s.status ?? null,
          raw: { ...s, _entry_id: entry.id },
        })
      }
    }
  }
  return out
}
