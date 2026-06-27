/**
 * agents_log insert helper · 3-retry exponential backoff · Sprint 8B B2.
 *
 * Extracted from agent-sdk-runner.ts so it can be unit-tested without
 * pulling in the @anthropic-ai/claude-agent-sdk top-level import (which
 * isn't resolvable from the root monorepo's vitest runner).
 *
 * Replaces the previous silent fire-and-forget pattern
 *   `.then(() => { /* best-effort log *​/ })`
 * which swallowed both PostgREST `data.error` responses AND network
 * rejections. Failures are now logged to console with attempt number +
 * reason · final unrecoverable failure logged as ERROR with row preview.
 *
 * Still safe to call fire-and-forget · never throws to caller · success
 * returns void.
 */

/** Exponential backoff delays in ms · 3 attempts total (initial + 2 retries). */
export const AGENTS_LOG_RETRY_DELAYS_MS = [100, 500, 2000]

// `insert` is typed as PromiseLike (not Promise) so the real Supabase client
// is structurally assignable · supabase-js `.from().insert()` returns a
// PostgrestFilterBuilder which is a thenable but NOT a full Promise (no
// catch/finally/Symbol.toStringTag). `await` only needs `.then()`, so
// PromiseLike is the precise contract this helper actually uses.
type SupabaseLike = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message: string } | null }>
  }
}

export async function insertWithRetry(
  supabase: SupabaseLike,
  row: Record<string, unknown>,
  canonicalSlug: string,
): Promise<void> {
  for (let attempt = 0; attempt < AGENTS_LOG_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { error } = await supabase.from('agents_log').insert(row)
      if (!error) return // success · done
      const isLastAttempt = attempt === AGENTS_LOG_RETRY_DELAYS_MS.length - 1
      const log = isLastAttempt ? console.error : console.warn
      log(
        `[agents-log] ${isLastAttempt ? 'ERROR' : 'WARN'} insert attempt ${attempt + 1}/${AGENTS_LOG_RETRY_DELAYS_MS.length} failed for ${canonicalSlug} · code=${error.code ?? '-'} · ${error.message}`,
      )
      if (isLastAttempt) {
        console.error('[agents-log] giving up · row preview·', JSON.stringify(row).slice(0, 400))
        return
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isLastAttempt = attempt === AGENTS_LOG_RETRY_DELAYS_MS.length - 1
      const log = isLastAttempt ? console.error : console.warn
      log(
        `[agents-log] ${isLastAttempt ? 'ERROR' : 'WARN'} insert attempt ${attempt + 1}/${AGENTS_LOG_RETRY_DELAYS_MS.length} threw for ${canonicalSlug} · ${msg}`,
      )
      if (isLastAttempt) {
        console.error('[agents-log] giving up · row preview·', JSON.stringify(row).slice(0, 400))
        return
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, AGENTS_LOG_RETRY_DELAYS_MS[attempt]))
  }
}
