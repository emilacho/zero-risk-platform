/**
 * WhatsApp notify hook · Sprint 5 wire-in.
 *
 * Thin helper que envuelve `POST /api/whatsapp/send` para uso interno
 * desde · (a) journey orchestrator (post-publish stage transition) ·
 * (b) HITL resolve handler (optional callback) · (c) agent tool calls.
 *
 * Diseño · never throws · graceful 503 cuando env missing · siempre
 * persiste row en whatsapp_messages (best-effort dentro del endpoint).
 * Caller no necesita handle errores · solo log advisory.
 */
import { sendTemplate, sendText } from "@/lib/whatsapp/meta-graph"
import { getSupabaseAdmin } from "@/lib/supabase"

export type NotifyContext = "nexus-publish" | "hitl-callback" | "agent-tool" | "manual"

export interface NotifyTemplateInput {
  to_phone: string
  template_name: string
  variables?: string[]
  language?: string
  contact_id?: string | null
  client_id?: string | null
  context: NotifyContext
  caller_detail?: string
}

export interface NotifyTextInput {
  to_phone: string
  text_body: string
  contact_id?: string | null
  client_id?: string | null
  context: NotifyContext
  caller_detail?: string
}

export interface NotifyResult {
  attempted: boolean
  ok: boolean
  provider_message_id: string | null
  code: string | null
  detail: string | null
}

async function persistRow(
  direction: "out",
  input: {
    phone: string
    template_name: string | null
    body: string | null
    status: string
    provider_message_id: string | null
    error_code: string | null
    error_detail: string | null
    contact_id: string | null
    caller: string
    meta_payload: Record<string, unknown>
  },
): Promise<void> {
  try {
    const supa = getSupabaseAdmin()
    await supa.from("whatsapp_messages").insert({
      direction,
      contact_id: input.contact_id,
      phone_number: input.phone,
      template_name: input.template_name,
      body: input.body,
      status: input.status,
      provider_message_id: input.provider_message_id,
      error_code: input.error_code,
      error_detail: input.error_detail,
      caller: input.caller,
      meta_payload: input.meta_payload,
    })
  } catch (err) {
    console.error("[whatsapp-notify] persist log row failed:", err)
  }
}

export async function notifyTemplate(
  input: NotifyTemplateInput,
): Promise<NotifyResult> {
  const result = await sendTemplate({
    to: input.to_phone,
    template_name: input.template_name,
    variables: input.variables,
    language: input.language,
  })

  const caller = `notify-template:${input.context}${input.caller_detail ? `:${input.caller_detail}` : ""}`
  await persistRow("out", {
    phone: input.to_phone,
    template_name: input.template_name,
    body: null,
    status: result.ok ? "sent" : "failed",
    provider_message_id: result.ok ? result.provider_message_id : null,
    error_code: result.ok ? null : result.code,
    error_detail: result.ok ? null : result.detail,
    contact_id: input.contact_id ?? null,
    caller,
    meta_payload: {
      context: input.context,
      variables: input.variables ?? [],
      client_id: input.client_id ?? null,
    },
  })

  return result.ok
    ? {
        attempted: true,
        ok: true,
        provider_message_id: result.provider_message_id,
        code: null,
        detail: null,
      }
    : {
        attempted: true,
        ok: false,
        provider_message_id: null,
        code: result.code,
        detail: result.detail,
      }
}

export async function notifyText(input: NotifyTextInput): Promise<NotifyResult> {
  const result = await sendText({
    to: input.to_phone,
    text_body: input.text_body,
  })

  const caller = `notify-text:${input.context}${input.caller_detail ? `:${input.caller_detail}` : ""}`
  await persistRow("out", {
    phone: input.to_phone,
    template_name: null,
    body: input.text_body,
    status: result.ok ? "sent" : "failed",
    provider_message_id: result.ok ? result.provider_message_id : null,
    error_code: result.ok ? null : result.code,
    error_detail: result.ok ? null : result.detail,
    contact_id: input.contact_id ?? null,
    caller,
    meta_payload: {
      context: input.context,
      client_id: input.client_id ?? null,
    },
  })

  return result.ok
    ? {
        attempted: true,
        ok: true,
        provider_message_id: result.provider_message_id,
        code: null,
        detail: null,
      }
    : {
        attempted: true,
        ok: false,
        provider_message_id: null,
        code: result.code,
        detail: result.detail,
      }
}

/**
 * Decide if a notify should fire based on cliente eligibility.
 * Canonical gating · cliente vertical permits WhatsApp (always true in
 * single-tenant pilot) + contact has phone wireado en client_champions
 * (NULL phone → skip · NOT a failure · just advisory log).
 */
export async function shouldNotifyClient(clientId: string): Promise<{
  eligible: boolean
  reason: string
  phone: string | null
  champion_name: string | null
}> {
  try {
    const supa = getSupabaseAdmin()
    const { data: champion } = await supa
      .from("client_champions")
      .select("phone, name")
      .eq("client_id", clientId)
      .eq("is_primary", true)
      .maybeSingle()

    if (!champion) {
      return {
        eligible: false,
        reason: "no_primary_champion",
        phone: null,
        champion_name: null,
      }
    }
    if (!champion.phone) {
      return {
        eligible: false,
        reason: "champion_phone_missing",
        phone: null,
        champion_name: champion.name ?? null,
      }
    }
    return {
      eligible: true,
      reason: "ok",
      phone: champion.phone,
      champion_name: champion.name ?? null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return {
      eligible: false,
      reason: `lookup_error:${msg.slice(0, 100)}`,
      phone: null,
      champion_name: null,
    }
  }
}
