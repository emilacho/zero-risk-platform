/**
 * Editorial write-back · persist the gate's aggregated FINAL verdict to
 * `editorial_decisions` · Sprint 12 Fase 0 Inngest binding · §144 · SHADOW.
 *
 * CC#2 built `editorial_decisions` (migration 202606270010) as the AGGREGATED
 * final verdict · 1 row per review (UNIQUE review_id). Lifecycle ·
 *   - `camino_iii_tabulate` writes `machine_verdict` (PASS/REJECT/ESCALATE) ·
 *     row starts `status='PENDING'`.
 *   - On ESCALATE the gate (editorial-gate.ts) waits for a human · when it
 *     resolves, THIS write-back stamps the HUMAN verdict on the SAME row ·
 *     `final_verdict` + `resolved_by` + `resolved_at` + `status='RESOLVED'`.
 *
 * `camino_iii_reviews` / `camino_iii_votes` stay the home of the INDIVIDUAL
 * votes · `editorial_decisions` is the single source of the final aggregated
 * verdict. The gate write-back targets `editorial_decisions` ONLY (the old
 * branch wrote nowhere · it just read a camino_iii_reviews row to wake).
 *
 * §148 honest · NEVER throws · the durable gate must not crash because a
 * write failed. Returns a tagged result · the gate step logs it. The gate is
 * registered only in `SALA_INNGEST_MODE=live` so this stays dormant until the
 * §144 flip. Requires migration 202606270010 applied in prod (CC#2).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EditorialGateOutcome } from './editorial-gate'

/** Canon · the aggregated-verdict table · matches CC#2 migration 202606270010. */
export const EDITORIAL_DECISIONS_TABLE = 'editorial_decisions'

/** The verdict vocabulary of `editorial_decisions` (machine + final). */
export type EditorialVerdict = 'PASS' | 'REJECT' | 'ESCALATE'

/**
 * Map the gate outcome → `editorial_decisions.final_verdict`. Returns null for
 * NON-verdict outcomes (timed_out / expired / cancelled) · those do NOT resolve
 * the row · it stays PENDING for re-escalation. The 3 real resolutions map ·
 *   approved → PASS · rejected → REJECT · escalated_hitl → ESCALATE.
 */
export function mapOutcomeToFinalVerdict(
  outcome: EditorialGateOutcome['outcome'],
): EditorialVerdict | null {
  switch (outcome) {
    case 'approved':
      return 'PASS'
    case 'rejected':
      return 'REJECT'
    case 'escalated_hitl':
      return 'ESCALATE'
    default:
      return null // timed_out · expired · cancelled
  }
}

/** Reverse map · `editorial_decisions.final_verdict` → the gate's neutral
 *  resolution status. Used by the resume read-mapper (resume-emitter.ts) so
 *  the wake event speaks the gate vocabulary. */
export function verdictToResolutionStatus(
  verdict: string | null | undefined,
): 'approved' | 'rejected' | 'escalated_hitl' | null {
  switch (verdict) {
    case 'PASS':
      return 'approved'
    case 'REJECT':
      return 'rejected'
    case 'ESCALATE':
      return 'escalated_hitl'
    default:
      return null
  }
}

export interface PersistEditorialDecisionResult {
  /** false only when the write errored (Supabase down / table missing). */
  readonly ok: boolean
  /** true when a row's final verdict was stamped. false for non-verdict
   *  outcomes (timeout) OR when no PENDING row matched the review_id. */
  readonly written: boolean
  readonly reason?: string
}

export interface PersistEditorialDecisionDeps {
  readonly now?: () => number
  readonly logger?: {
    warn(msg: string, ctx?: Record<string, unknown>): void
    info(msg: string, ctx?: Record<string, unknown>): void
  }
}

const defaultLogger = {
  warn(msg: string, ctx?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.warn(`[sala/editorial-writeback] ${msg}`, ctx ?? {})
  },
  info(msg: string, ctx?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.log(`[sala/editorial-writeback] ${msg}`, ctx ?? {})
  },
}

/**
 * Stamp the human verdict onto the existing `editorial_decisions` row
 * (UPDATE by review_id · the row was created PENDING with machine_verdict by
 * `camino_iii_tabulate`). NEVER throws.
 *
 * Non-verdict outcomes (timeout) → no write · row stays PENDING for
 * re-escalation. Zero rows matched → logged warning (the upstream tabulate
 * never created the row) · returned `written:false` · NOT an error.
 */
export async function persistEditorialDecision(
  supabase: Pick<SupabaseClient, 'from'>,
  outcome: EditorialGateOutcome,
  deps: PersistEditorialDecisionDeps = {},
): Promise<PersistEditorialDecisionResult> {
  const logger = deps.logger ?? defaultLogger
  const now = deps.now ?? Date.now
  const verdict = mapOutcomeToFinalVerdict(outcome.outcome)

  if (verdict === null) {
    logger.info('non-verdict outcome · row stays PENDING', {
      review_id: outcome.review_id,
      outcome: outcome.outcome,
    })
    return {
      ok: true,
      written: false,
      reason: `non-verdict outcome: ${outcome.outcome}`,
    }
  }

  try {
    const { data, error } = await supabase
      .from(EDITORIAL_DECISIONS_TABLE)
      .update({
        status: 'RESOLVED',
        final_verdict: verdict,
        resolved_by: outcome.resolved_by,
        resolved_at: new Date(now()).toISOString(),
        rationale: outcome.decision_reason,
      })
      .eq('review_id', outcome.review_id)
      .select('id')

    if (error) {
      logger.warn('update failed (table missing?) · fail_open', {
        review_id: outcome.review_id,
        error: error.message,
      })
      return { ok: false, written: false, reason: error.message }
    }
    if (!data || data.length === 0) {
      logger.warn('no PENDING editorial_decisions row for review_id', {
        review_id: outcome.review_id,
        final_verdict: verdict,
      })
      return {
        ok: true,
        written: false,
        reason: 'no_row_for_review_id',
      }
    }
    logger.info('final verdict stamped', {
      review_id: outcome.review_id,
      final_verdict: verdict,
      resolved_by: outcome.resolved_by,
    })
    return { ok: true, written: true }
  } catch (e) {
    logger.warn('update threw · fail_open', {
      review_id: outcome.review_id,
      error: e instanceof Error ? e.message : String(e),
    })
    return {
      ok: false,
      written: false,
      reason: e instanceof Error ? e.message : String(e),
    }
  }
}
