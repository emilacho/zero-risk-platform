/**
 * Editorial gate · Inngest durable wait (Camino III HITL) · Sprint 12 Fase 0
 * Inngest binding · §144 · SHADOW (registered ONLY when SALA_INNGEST_MODE=live).
 *
 * The PROBLEM this solves · the Camino III editorial gate can escalate to a
 * human (`camino_iii_reviews.status='escalated_hitl'`) and then wait UP TO 24h
 * for an editor to resolve. n8n's `Wait` node is fragile for multi-hour waits
 * (worker restarts, timeouts, no replay). Inngest's `step.waitForEvent` is the
 * durable primitive · the run is freed from compute during the wait and resumes
 * exactly once when the resolution event lands (or when the timeout fires).
 *
 * Layering (Model B) · this function is the EXECUTOR-layer durable wait. It does
 * NOT decide votes (that is `camino_iii_tabulate` in Postgres) and it does NOT
 * own the projection (that is `sala_event_log`). It SUSPENDS until a human
 * resolves, then RETURNS the outcome · a Model B write-back step (separate,
 * not wired live here) posts the outcome to the sala so the journey resumes.
 *
 * Trigger event · `editorial/gate.requested` (data = EditorialGateRequest).
 * Resume event  · `editorial/decision.resolved` (data = EditorialResolution),
 *                 emitted by the resume seam (resume-emitter.ts · the task's
 *                 "G6 hook" · SALA_G6_HOOK_MODE) when a human resolves the
 *                 review row.
 *
 * §148 honest · the in-memory motor (`InngestExecutor`) deliberately throws on
 * `waitForEvent` ("NOT IMPLEMENTED in Mitad 1"). THIS file is the Mitad-2 real
 * binding · it uses the Inngest SDK's native `step.waitForEvent`, proven by the
 * runtime spike (RESULTS-CC3-inngest-runtime-verify §2.3). It registers ONLY in
 * live mode · default shadow keeps it dark (encendido = lote §144).
 */
import { inngestClient } from './client'
import { buildDeadLetterFailureHandler } from './dead-letter-handler'
import { persistEditorialDecision } from './editorial-writeback'

/** Inngest event that opens the gate · the router/worker sends this when a
 *  Camino III review escalates to HITL and needs durable waiting. */
export const EDITORIAL_GATE_REQUESTED_EVENT = 'editorial/gate.requested'

/** Inngest event that closes the gate · emitted by the resume seam when a
 *  human resolves the review (see resume-emitter.ts). */
export const EDITORIAL_DECISION_RESOLVED_EVENT = 'editorial/decision.resolved'

/** Canon · default human-review window · 24h (ADR-018 caps practical gate
 *  lifetimes; the editorial gate uses the canonical 24h Camino III window). */
export const EDITORIAL_GATE_TIMEOUT = '24h'

/** Payload that opens the gate. `review_id` is the idempotency + match key. */
export interface EditorialGateRequest {
  /** camino_iii_reviews.id · the review awaiting human resolution. THE match key. */
  readonly review_id: string
  /** Sala stream id (= _journey_id · §149) so the write-back targets the run. */
  readonly stream_id: string
  /** workflow_id propagated for §149 attribution + audit (guardrail 4/6). */
  readonly workflow_id: string
  /** Client the review belongs to. */
  readonly client_id?: string | null
  /** Campaign the review belongs to (optional). */
  readonly campaign_id?: string | null
  /** Override the 24h window (tests pass a short value). */
  readonly timeout?: string
}

/** Payload that resolves the gate · sent on the resume event. */
export interface EditorialResolution {
  /** Must equal the gate's `review_id` · the match key. */
  readonly review_id: string
  /** Canonical Camino III terminal status. */
  readonly status: 'approved' | 'rejected' | 'escalated_hitl' | 'expired' | 'cancelled'
  /** Who resolved it (camino_iii_reviews.hitl_resolved_by) · null for system. */
  readonly resolved_by?: string | null
  /** Free-text reason (camino_iii_reviews.decision_reason). */
  readonly decision_reason?: string | null
}

/** Normalised outcome the gate function returns · consumed by the Model B
 *  write-back step (separate · not wired live here). */
export interface EditorialGateOutcome {
  readonly review_id: string
  readonly resolved: boolean
  /** 'approved' | 'rejected' | ... when resolved · 'timed_out' when the 24h
   *  window elapsed with no resolution event. */
  readonly outcome: EditorialResolution['status'] | 'timed_out'
  readonly resolved_by: string | null
  readonly decision_reason: string | null
  /** true when the gate hit its timeout instead of a human resolution · the
   *  write-back should escalate (Slack ping / re-open) rather than proceed. */
  readonly timed_out: boolean
}

/**
 * Pure decision mapper · turns the (possibly null) resolution event into the
 * normalised gate outcome. Exposed so unit tests cover every branch WITHOUT
 * spinning up the Inngest runtime (CI has no Inngest creds · same pattern as
 * `runSyntheticCanary`).
 *
 * `resolved === null` means `step.waitForEvent` timed out (24h elapsed).
 */
export function decideEditorialOutcome(
  request: EditorialGateRequest,
  resolved: EditorialResolution | null,
): EditorialGateOutcome {
  if (resolved === null) {
    return {
      review_id: request.review_id,
      resolved: false,
      outcome: 'timed_out',
      resolved_by: null,
      decision_reason: 'editorial gate timed out · no human resolution within window',
      timed_out: true,
    }
  }
  return {
    review_id: resolved.review_id,
    resolved: true,
    outcome: resolved.status,
    resolved_by: resolved.resolved_by ?? null,
    decision_reason: resolved.decision_reason ?? null,
    timed_out: false,
  }
}

/**
 * The editorial gate Inngest function. Suspends on `step.waitForEvent` until a
 * matching `editorial/decision.resolved` lands (matched by `review_id`) or the
 * 24h window elapses. Idempotent per `review_id` (24h TTL) so a duplicate gate
 * request collapses to the one in-flight wait · no double-gate.
 *
 * retries: 0 · the body is a durable wait, not retryable work · re-running it
 * would open a second wait. onFailure still routes to the DLQ for forensics.
 */
export const editorialGateFn = inngestClient.createFunction(
  {
    id: 'editorial-gate-camino-iii',
    name: 'Editorial Gate · Camino III HITL durable wait · §144 (live-gated)',
    idempotency: 'event.data.review_id',
    retries: 0,
    triggers: [{ event: EDITORIAL_GATE_REQUESTED_EVENT }],
    onFailure: buildDeadLetterFailureHandler('editorial-gate-camino-iii'),
  },
  async ({ event, step }) => {
    const request = (event.data ?? {}) as EditorialGateRequest

    // Durable wait · resumes when a human resolves OR the window elapses. The
    // run holds NO compute during the wait (Inngest frees it) · survives
    // redeploys. `match` ties the resolution to THIS review only.
    const resolved = (await step.waitForEvent('await-editorial-resolution', {
      event: EDITORIAL_DECISION_RESOLVED_EVENT,
      timeout: request.timeout ?? EDITORIAL_GATE_TIMEOUT,
      match: 'data.review_id',
    })) as { data?: EditorialResolution } | null

    const outcome = decideEditorialOutcome(
      request,
      resolved?.data ?? null,
    )

    // Write-back · stamp the aggregated FINAL verdict on `editorial_decisions`
    // (CC#2 migration 202606270010 · UNIQUE review_id · row created PENDING by
    // camino_iii_tabulate with machine_verdict). A durable `step.run` so the
    // write is memoised across replays · NEVER throws (persistEditorialDecision
    // returns a tagged result). Non-verdict outcomes (timeout) leave the row
    // PENDING for re-escalation. Lazy-import the admin client so a cold start
    // that never opens a gate does not pay the Supabase construction.
    const writeback = await step.run('writeback-editorial-decision', async () => {
      let supabase
      try {
        const { getSupabaseAdmin } = await import('@/lib/supabase')
        supabase = getSupabaseAdmin()
      } catch {
        return { ok: false, written: false, reason: 'supabase-unconfigured' }
      }
      return persistEditorialDecision(supabase, outcome)
    })

    // The outcome is the function's return value. In Model B a separate
    // event-log write-back (POST `/api/sala/events/append`) advances the
    // journey projection · that adapter is wired in the §144 flip lote.
    return { ...outcome, writeback }
  },
)
