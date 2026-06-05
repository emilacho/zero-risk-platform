/**
 * Canon canonical types · sala-router-consumer · Phase 1 prep.
 *
 * The CONSUMER (router-side) of the ingress event chain ·
 *   1. ingress endpoint (PR #176) appends `step_completed` event with
 *      step_id matching `intake.{source}.{intent}` to sala_event_log
 *   2. THIS consumer reads pending intake events from the log
 *   3. For each · looks up dispatch target (embedded in event payload by
 *      ingress · trust-but-verify pattern) · calls workflow-dispatcher
 *      Model B (#172)
 *   4. Appends a marker event `step_completed` with step_id matching
 *      `router.dispatch.{source}.{intent}` to prevent re-processing
 *
 * §148 honest · this lib does NOT import from sala-ingress · it relies on
 * the EVENT SHAPE CONTRACT (step_id pattern + payload keys) · tests
 * verify shape compatibility via fixtures matching PR #176 output. The
 * decoupling lets this PR ship standalone against main.
 *
 * Canon ADR-018 · this is the SECOND HALF of the dispatcher chain · the
 * consumer is the SINGLE dispatcher (workflow-dispatcher invoked from
 * here · never from ingress · never from anywhere else for journey
 * dispatches).
 */
import type { PersistedEvent } from '@/lib/sala-event-log'
import type {
  WorkflowDispatchResult,
} from '@/lib/sala-journey-dispatch'
import type { JourneyType } from '@/lib/sala/libretos'

// =====================================================================
// Step ID patterns · canon contract between ingress + consumer
// =====================================================================

/** Canon canonical · prefix that identifies an INTAKE event the consumer
 *  should process · matches `intake.{source}.{intent}` step_id pattern
 *  written by /api/sala/intake (PR #176 orchestrator). */
export const INTAKE_STEP_PREFIX = 'intake.'

/** Canon canonical · prefix the consumer writes for the marker event ·
 *  matches `router.dispatch.{source}.{intent}` step_id pattern. The
 *  SELECT for pending intake events excludes rows that already have a
 *  matching marker by (stream_id, source, intent). */
export const DISPATCH_MARKER_PREFIX = 'router.dispatch.'

// =====================================================================
// Parsed intake event · what the consumer extracts from a PersistedEvent
// =====================================================================

/** Canon canonical · the dispatch info carried in the intake event's
 *  payload by the ingress orchestrator. Trust-but-verify · `parsing.ts`
 *  validates each field before the consumer uses it. */
export interface ParsedIntakeEvent {
  readonly event_id: string
  readonly stream_id: string
  readonly correlation_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: JourneyType
  readonly intake_source: string
  readonly intake_intent: string
  readonly worker_workflow_id: string
  /** Canon canonical · the raw event the consumer is processing · kept
   *  for causation chain + idempotency · `caused_by_event_id` in the
   *  resulting DispatchDecision matches `event_id`. */
  readonly source_event: PersistedEvent
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string }

// =====================================================================
// Per-event outcome + tick-level result
// =====================================================================

export type DispatchOutcomeKind =
  | 'dispatched_ok'
  | 'dispatched_failed'
  | 'skipped_parse_error'
  | 'skipped_unknown_journey'
  | 'skipped_dispatcher_off'
  /**
   * Canon canonical · cap-blocked outcome (SPEC lazo agentico 2026-06-05) ·
   * `evaluateNaufragoRunCap` returned `block` because the per-run cumulative
   * cost exceeded the canonical USD cap. The dispatcher is NOT called ·
   * a marker is still written to preserve idempotency (canon §150 G2 · no
   * retry-loop incidental on cap-blocks). The dashboard surfaces the block
   * via the marker's payload.dispatch_kind = 'skipped_cap_blocked'.
   */
  | 'skipped_cap_blocked'
  | 'marker_write_failed'

export interface DispatchOutcome {
  readonly intake_event_id: string
  readonly stream_id: string
  readonly kind: DispatchOutcomeKind
  /** Canon canonical · when dispatched_ok · the dispatcher's result. */
  readonly dispatch_result?: WorkflowDispatchResult
  /** Canon canonical · the marker event id if the marker was written
   *  successfully. NULL when kind=marker_write_failed. */
  readonly marker_event_id: string | null
  /** Canon canonical · summary of what happened · audit/log. */
  readonly detail: string
}

export interface ConsumerTickResult {
  readonly tick_id: string
  readonly started_at: string
  readonly finished_at: string
  readonly scanned: number
  readonly processed: number
  readonly outcomes: ReadonlyArray<DispatchOutcome>
}

// =====================================================================
// Tick input · injection points for tests
// =====================================================================

export interface ConsumerTickInput {
  readonly tenant_id?: string
  /** Canon canonical · cap on rows per tick · default 10 · hard cap 100. */
  readonly batch_size?: number
  /** Optional · override the env flag for tests + smoke. */
  readonly enabled?: boolean
  /** Optional · override n8n_base_url for tests. Production reads
   *  `process.env.N8N_BASE_URL`. */
  readonly n8n_base_url?: string
  /** Optional · override fetch for tests (workflow-dispatcher fetcher). */
  readonly fetcher?: typeof fetch
}
