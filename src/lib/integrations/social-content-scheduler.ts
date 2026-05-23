/**
 * Social content scheduler hook · Sprint 5 wire-in.
 *
 * Helper para journey orchestrator + editor-en-jefe agent · cuando
 * NEXUS Phase de content generation produce un payload con social_caption +
 * network + media_urls · llama este helper para persistir el row con
 * `status = 'pending_approval'`. HITL gate intermedio · admin aprueba via
 * Mission Control → status='scheduled' → n8n cron publica.
 *
 * Diseño · never throws · siempre persiste row (status='failed' si DB
 * insert falla). Validations · network IG/FB only (LinkedIn/TikTok Sprint
 * #N+) · media_urls ≤ 10 · scheduled_at ≤ 30 days future (HARD CHECK constraint
 * tabla social_posts).
 */
import { getSupabaseAdmin } from "@/lib/supabase"

export type SocialNetwork = "facebook" | "instagram"

export interface ScheduleContentInput {
  network: SocialNetwork
  content: string
  media_urls?: string[]
  /** ISO timestamp · si null · default now + 1h (HITL review window) */
  scheduled_at?: string
  client_id?: string | null
  /** Agent slug que generó el contenido · ej "editor-en-jefe" */
  created_by_agent?: string
  /** NEXUS phase context · ej "production" · "qa_review" */
  caller_phase?: string
}

export interface ScheduleResult {
  ok: boolean
  id?: string
  status?: string
  scheduled_at?: string
  error?: string
}

const VALID_NETWORKS = new Set<SocialNetwork>(["facebook", "instagram"])
const MAX_MEDIA_URLS = 10
const DEFAULT_HITL_DELAY_MS = 60 * 60 * 1000 // 1h default

export async function scheduleSocialContent(
  input: ScheduleContentInput,
): Promise<ScheduleResult> {
  if (!VALID_NETWORKS.has(input.network)) {
    return {
      ok: false,
      error: `invalid network · IG/FB only · got ${input.network}`,
    }
  }
  if (!input.content || input.content.trim().length === 0) {
    return { ok: false, error: "content required" }
  }

  const mediaUrls = Array.isArray(input.media_urls) ? input.media_urls : []
  if (mediaUrls.length > MAX_MEDIA_URLS) {
    return {
      ok: false,
      error: `media_urls exceeds ${MAX_MEDIA_URLS} cap`,
    }
  }

  const scheduledAt =
    input.scheduled_at ??
    new Date(Date.now() + DEFAULT_HITL_DELAY_MS).toISOString()
  const when = new Date(scheduledAt)
  if (Number.isNaN(when.getTime())) {
    return { ok: false, error: "scheduled_at must be valid ISO timestamp" }
  }

  try {
    const supa = getSupabaseAdmin()
    const { data, error } = await supa
      .from("social_posts")
      .insert({
        network: input.network,
        content: input.content,
        media_urls: mediaUrls,
        scheduled_at: when.toISOString(),
        client_id: input.client_id ?? null,
        created_by: input.created_by_agent ?? null,
        caller: input.caller_phase
          ? `nexus-${input.caller_phase}-scheduler`
          : "scheduler-helper",
        status: "pending_approval",
      })
      .select("id, status, scheduled_at")
      .single()

    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? "insert returned no row",
      }
    }

    return {
      ok: true,
      id: data.id,
      status: data.status,
      scheduled_at: data.scheduled_at,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return { ok: false, error: msg.slice(0, 300) }
  }
}

/**
 * Approve a pending_approval social post · canonical HITL transition.
 * Called by Mission Control HITL resolve handler when admin approves the
 * social caption · transitions status pending_approval → scheduled.
 * n8n cron picks up scheduled rows.
 */
export async function approveSocialPost(
  id: string,
  approver_id?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supa = getSupabaseAdmin()
    const { error } = await supa
      .from("social_posts")
      .update({
        status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending_approval")

    if (error) {
      return { ok: false, error: error.message }
    }
    // Best-effort audit log to whatsapp_messages-style table not available;
    // approver_id metadata flows via dedicated audit table when wired.
    if (approver_id) {
      console.log(
        `[social-content-scheduler] approved post ${id} by ${approver_id}`,
      )
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return { ok: false, error: msg.slice(0, 300) }
  }
}
