/**
 * Track P · callback attempt audit persistence (SPEC 2026-06-09 · §144 GO
 * 2026-06-26).
 *
 * Capa 2 of Track P · one row per callback attempt into Supabase
 * `agent_callback_attempts` (canon guardrail 4 · audit trail). Kept OUT of
 * `index.ts` so the dispatch lib stays Supabase-free + trivially unit-tested;
 * the route wires the real logger via `makeCallbackAttemptLogger`.
 *
 * §148 honest · NEVER throws · NEVER blocks the callback. Fire-and-forget ·
 * the insert promise is started and its rejection is swallowed to
 * `console.error`. If the table does not exist yet (migration not applied),
 * the insert errors and we log to console only · the callback proceeds.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CallbackAttemptLog } from './index'

/** Canon · the audit table name · matches the migration. */
export const CALLBACK_ATTEMPTS_TABLE = 'agent_callback_attempts'

/**
 * Persist a single callback attempt row · fire-and-forget. Resolves to void
 * regardless of outcome. On any error (table missing, network) it logs to
 * `console.error` and returns · it never rejects, never throws.
 */
export async function persistCallbackAttempt(
  supabase: SupabaseClient,
  log: CallbackAttemptLog,
): Promise<void> {
  try {
    const { error } = await supabase.from(CALLBACK_ATTEMPTS_TABLE).insert({
      workflow_id: log.workflow_id,
      callback_url: log.callback_url,
      attempt_number: log.attempt_number,
      status: log.status,
      http_status_code: log.http_status_code,
      error_message: log.error_message,
      attempted_at: log.attempted_at,
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[track-p callback-attempt] persist failed (table missing?) · ${error.message} · ` +
          `wf=${log.workflow_id} attempt=${log.attempt_number} status=${log.status}`,
      )
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `[track-p callback-attempt] persist threw · ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}

/**
 * Build the `onAttempt` hook for `dispatchAsyncCallback`. Returns a synchronous
 * function (the dispatch lib does NOT await it) that fires the fire-and-forget
 * Supabase insert. Returns `undefined` when no Supabase client is available so
 * the dispatch falls back to console-only behaviour (still never blocks).
 */
export function makeCallbackAttemptLogger(
  supabase: SupabaseClient | null,
): ((log: CallbackAttemptLog) => void) | undefined {
  if (!supabase) return undefined
  return (log: CallbackAttemptLog) => {
    // Fire-and-forget · do not await · swallow rejection.
    void persistCallbackAttempt(supabase, log)
  }
}
