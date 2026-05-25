/**
 * `agent_invocations` insert helper · 3-retry exponential backoff · Sprint 8D
 * cuenta #1 closure.
 *
 * Sibling of `agents-log-retry.ts` · same retry contract but targets the
 * canonical `agent_invocations` table that Sprint 8D enforcement audits
 * against (`workflow_id IS NULL` queries). The Vercel proxy at
 * `/api/agents/run` writes here for legacy CLI invocations; this helper
 * adds Railway agent-runner write so n8n direct invocations (Sprint 8D
 * Fase 1 bypass) also land on the canonical table.
 *
 * Without this dual write, every modern n8n workflow that calls Railway
 * directly produces a `success` response with cost + tokens but ZERO rows
 * in `agent_invocations` · audit trail BROKEN, canon enforcement query
 * meaningless. See vault doc
 * `raw/qa/2026-05-25-agent-invocations-persistence-regression-fix.md`.
 *
 * Still safe to call fire-and-forget · never throws to caller · success
 * returns void.
 */

/** Exponential backoff delays in ms · 3 attempts total (initial + 2 retries). */
export const AGENT_INVOCATIONS_RETRY_DELAYS_MS = [100, 500, 2000]

type SupabaseLike = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { code?: string; message: string } | null }>
  }
}

export async function insertAgentInvocationWithRetry(
  supabase: SupabaseLike,
  row: Record<string, unknown>,
  canonicalSlug: string,
): Promise<void> {
  for (let attempt = 0; attempt < AGENT_INVOCATIONS_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { error } = await supabase.from('agent_invocations').insert(row)
      if (!error) return
      const isLastAttempt = attempt === AGENT_INVOCATIONS_RETRY_DELAYS_MS.length - 1
      const log = isLastAttempt ? console.error : console.warn
      log(
        `[agent-invocations] ${isLastAttempt ? 'ERROR' : 'WARN'} insert attempt ${attempt + 1}/${AGENT_INVOCATIONS_RETRY_DELAYS_MS.length} failed for ${canonicalSlug} · code=${error.code ?? '-'} · ${error.message}`,
      )
      if (isLastAttempt) {
        console.error('[agent-invocations] giving up · row preview·', JSON.stringify(row).slice(0, 400))
        return
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isLastAttempt = attempt === AGENT_INVOCATIONS_RETRY_DELAYS_MS.length - 1
      const log = isLastAttempt ? console.error : console.warn
      log(
        `[agent-invocations] ${isLastAttempt ? 'ERROR' : 'WARN'} insert attempt ${attempt + 1}/${AGENT_INVOCATIONS_RETRY_DELAYS_MS.length} threw for ${canonicalSlug} · ${msg}`,
      )
      if (isLastAttempt) {
        console.error('[agent-invocations] giving up · row preview·', JSON.stringify(row).slice(0, 400))
        return
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, AGENT_INVOCATIONS_RETRY_DELAYS_MS[attempt]))
  }
}
