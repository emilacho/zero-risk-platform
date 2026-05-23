/**
 * Sprint 7.7 Track D2 · client_id late-binding enricher.
 *
 * When `/api/agents/run` cannot resolve `client_id` from request body via
 * `resolveClientIdFromBody()`, fall back to DB lookups via FK columns ya
 * presentes en el invocation context (workflow_execution_id · journey_id ·
 * task_id). This catches the 23.5% billing gap (73 rows / 30d) discovered
 * en `2026-05-22-anthropic-spend-rollup.md` audit.
 *
 * Lookup chain (first match wins) ·
 *   1. workflow_execution_id → `workflow_executions.client_id`
 *   2. journey_id            → `journey_executions.client_id`
 *   3. task_id               → `client_tasks.client_id` OR onboarding_sessions
 *   4. NULL (legitimate · system-level invocation sin cliente owner)
 *
 * NO mutates anything · pure read-only enrichment. Caller decides how
 * to apply the result a la insert payload.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface EnrichmentContext {
  workflow_execution_id?: string | null
  journey_id?: string | null
  task_id?: string | null
  session_id?: string | null
}

export interface EnrichmentResult {
  client_id: string | null
  source:
    | "body"
    | "workflow_execution"
    | "journey_execution"
    | "client_task"
    | "onboarding_session"
    | "session_resume"
    | "none"
  attempted_lookups: string[]
}

/**
 * Best-effort DB enrichment · returns first successful client_id from FK
 * lookups, or null si todas las tablas devuelven nada. Errors swallowed ·
 * logs advisory. NEVER throws upstream.
 */
export async function enrichClientIdFromContext(
  supabase: SupabaseClient,
  initialClientId: string | null,
  context: EnrichmentContext,
): Promise<EnrichmentResult> {
  const attempted: string[] = []

  if (initialClientId && initialClientId.length > 0) {
    return { client_id: initialClientId, source: "body", attempted_lookups: [] }
  }

  // 1 · workflow_executions FK lookup
  if (context.workflow_execution_id) {
    attempted.push("workflow_executions")
    try {
      const { data } = await supabase
        .from("workflow_executions")
        .select("client_id")
        .eq("id", context.workflow_execution_id)
        .maybeSingle()
      const cid = (data as { client_id?: string } | null)?.client_id
      if (cid) {
        return { client_id: cid, source: "workflow_execution", attempted_lookups: attempted }
      }
    } catch (err) {
      console.log(
        `[client-id-enricher] workflow_executions lookup failed · ${err instanceof Error ? err.message : "unknown"}`,
      )
    }
  }

  // 2 · journey_executions FK lookup
  if (context.journey_id) {
    attempted.push("journey_executions")
    try {
      const { data } = await supabase
        .from("journey_executions")
        .select("client_id")
        .eq("id", context.journey_id)
        .maybeSingle()
      const cid = (data as { client_id?: string } | null)?.client_id
      if (cid) {
        return { client_id: cid, source: "journey_execution", attempted_lookups: attempted }
      }
    } catch (err) {
      console.log(
        `[client-id-enricher] journey_executions lookup failed · ${err instanceof Error ? err.message : "unknown"}`,
      )
    }
  }

  // 3 · client_tasks FK lookup
  if (context.task_id) {
    attempted.push("client_tasks")
    try {
      const { data } = await supabase
        .from("client_tasks")
        .select("client_id")
        .eq("id", context.task_id)
        .maybeSingle()
      const cid = (data as { client_id?: string } | null)?.client_id
      if (cid) {
        return { client_id: cid, source: "client_task", attempted_lookups: attempted }
      }
    } catch (err) {
      console.log(
        `[client-id-enricher] client_tasks lookup failed · ${err instanceof Error ? err.message : "unknown"}`,
      )
    }

    // 3b · onboarding_sessions (task_id puede ser onboarding_id en older callers)
    attempted.push("onboarding_sessions")
    try {
      const { data } = await supabase
        .from("onboarding_sessions")
        .select("client_id")
        .eq("id", context.task_id)
        .maybeSingle()
      const cid = (data as { client_id?: string } | null)?.client_id
      if (cid) {
        return { client_id: cid, source: "onboarding_session", attempted_lookups: attempted }
      }
    } catch (err) {
      console.log(
        `[client-id-enricher] onboarding_sessions lookup failed · ${err instanceof Error ? err.message : "unknown"}`,
      )
    }
  }

  // 4 · session_id resume chain · find prior invocation con same session_id
  // que SI tenga client_id populated
  if (context.session_id) {
    attempted.push("agent_invocations_session_resume")
    try {
      const { data } = await supabase
        .from("agent_invocations")
        .select("client_id")
        .eq("session_id", context.session_id)
        .not("client_id", "is", null)
        .limit(1)
        .maybeSingle()
      const cid = (data as { client_id?: string } | null)?.client_id
      if (cid) {
        return { client_id: cid, source: "session_resume", attempted_lookups: attempted }
      }
    } catch (err) {
      console.log(
        `[client-id-enricher] session_resume lookup failed · ${err instanceof Error ? err.message : "unknown"}`,
      )
    }
  }

  return { client_id: null, source: "none", attempted_lookups: attempted }
}
