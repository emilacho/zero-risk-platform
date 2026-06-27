/**
 * Canon canonical · escalón 3 · wire router → handler en SHADOW.
 *
 * Spec · `ENCENDIDO-escalon-3-router-2026-06-04.md`. The handler reads an
 * incoming event from the event-log, derives the journey-state projection,
 * looks up the libreto, calls `router.decide`, and **LOGS** every
 * decision via a structured logger. It does NOT enqueue, dispatch, or
 * execute anything · canon §148 SHADOW STRICT.
 *
 * Escalón 4 (G6 atomic bucket live) + escalón 5 (flip enforce → executor
 * handoff) wire on top of this surface in later §144 steps.
 *
 * Design notes:
 *   - Pure function over event-log + libreto + budget seam · the same
 *     decide() unit-tested in PR #149 is reused verbatim.
 *   - Logging is structured (JSON) so Vercel / Sentry / log scrapers can
 *     filter by `kind`, `stream_id`, `decision_kind`, `idempotency_key`.
 *   - The logger is INJECTABLE · tests capture decisions in memory; prod
 *     uses console.log so the Vercel function log surfaces every
 *     decision in the dashboard.
 */
import { readJourneyState } from '@/lib/sala-journey-state'
import type { JourneyState } from '@/lib/sala-journey-state'
import type {
  PersistedEvent,
  EventLogStorage,
} from '@/lib/sala-event-log'
import {
  decide,
  allowAllBudgetStub,
  type BudgetCheckFn,
  type Decision,
  type LibretoLookup,
  type ResolveNextStepFn,
} from './index'

// =====================================================================
// Structured logger seam
// =====================================================================

/**
 * Canon canonical · the structured log entry emitted for every decision
 * the router would have dispatched. The shape is intentionally flat so
 * log query tools can filter by individual fields without unwrap.
 *
 * §148 canon canon · `canon: 'sala-shadow-router'` is a constant marker
 * so log scrapers (Sentry breadcrumbs, Vercel filters, future projection
 * jobs) can pick out shadow-router emissions and exclude them from any
 * real dispatch counting until escalón 5 flips enforce.
 */
export interface ShadowDecisionLog {
  readonly canon: 'sala-shadow-router'
  readonly mode: 'shadow'
  readonly logged_at: string
  /** Canon canonical · the event_id that triggered the routing call · canon
   *  ties this log entry to a row in `sala_event_log` for forensics. */
  readonly trigger_event_id: string
  readonly trigger_event_type: string
  readonly stream_id: string
  readonly correlation_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: string | null
  readonly journey_state_status: JourneyState['status']
  readonly journey_state_current_step: string | null
  /** Canon canonical · 1 entry per emitted Decision · most events resolve
   *  to a single decision; fork steps may produce N. */
  readonly decision_kind: Decision['kind']
  readonly decision: Decision
  /** Canon canonical · the position of this decision inside the
   *  Decision[] returned by decide() · 0-based · useful for fork
   *  fan-out forensics. */
  readonly decision_index: number
  readonly decision_count: number
}

export type ShadowLogger = (entry: ShadowDecisionLog) => void

/**
 * Canon canonical · the default production logger · writes a single
 * structured JSON line to stdout so Vercel / Inngest cloud / Sentry
 * breadcrumbs pick it up with zero adapter code.
 */
export const consoleShadowLogger: ShadowLogger = (entry) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry))
}

// =====================================================================
// Handler input / output
// =====================================================================

export interface ShadowHandlerConfig {
  readonly storage: EventLogStorage
  readonly libreto_lookup: LibretoLookup
  readonly resolve_next_step: ResolveNextStepFn
  /** Canon canonical · default `allowAllBudgetStub` for shadow. Real G6
   *  bucket wires here in escalón 4 (NOT this PR). */
  readonly budget_check?: BudgetCheckFn
  /** Canon canonical · injectable logger · default `consoleShadowLogger`.
   *  Tests inject an in-memory logger to capture + assert. */
  readonly logger?: ShadowLogger
}

export interface ShadowHandlerResult {
  readonly trigger_event: PersistedEvent
  readonly journey_state: JourneyState
  readonly decisions: Decision[]
  /** Canon canonical · the exact log lines emitted, ordered. Tests can
   *  assert the decisions + the logging in one shot. */
  readonly logs: ReadonlyArray<ShadowDecisionLog>
}

// =====================================================================
// Wiring · the function that escalón 3 hands to the cron/handler
// =====================================================================

/**
 * Canon canonical · process a single trigger event in SHADOW mode.
 *
 * Pipeline:
 *   1. Read the journey-state projection for the event's stream (Track F).
 *   2. Resolve the libreto by `event.journey_type` (Track E).
 *   3. Call `router.decide({event, journey_state, ...})` (Track H).
 *   4. LOG every Decision via the injected logger. NO enqueue. NO
 *      dispatch. NO executor call. NO G6 live.
 *
 * §148 honest · the function returns the decisions so the caller can
 * decide what to do with them (today: nothing in production; tests
 * assert). The wiring to the real handler chain happens in escalón 5.
 */
export async function processSalaEventShadow(
  trigger_event: PersistedEvent,
  config: ShadowHandlerConfig,
): Promise<ShadowHandlerResult> {
  const logger = config.logger ?? consoleShadowLogger
  const budget_check = config.budget_check ?? allowAllBudgetStub

  // ── Step 1 · derive the journey-state projection for the stream ──
  // The projection is replayable from the log; we read the canonical
  // projection so the router sees exactly what the rest of the sala
  // would see if it queried right now.
  const journey_state = await readJourneyState(config.storage, {
    stream_id: trigger_event.stream_id,
    tenant_id: trigger_event.tenant_id,
  })

  // ── Step 2 · call decide() in SHADOW ─────────────────────────────
  const decisions = decide({
    event: trigger_event,
    journey_state,
    libreto_lookup: config.libreto_lookup,
    resolve_next_step: config.resolve_next_step,
    budget_check,
  })

  // ── Step 3 · LOG every decision · NO further action ──────────────
  const logged_at = new Date().toISOString()
  const logs: ShadowDecisionLog[] = decisions.map((decision, idx) => ({
    canon: 'sala-shadow-router',
    mode: 'shadow',
    logged_at,
    trigger_event_id: trigger_event.event_id,
    trigger_event_type: trigger_event.event_type,
    stream_id: trigger_event.stream_id,
    correlation_id: trigger_event.correlation_id,
    tenant_id: trigger_event.tenant_id,
    client_id: trigger_event.client_id,
    journey_type: journey_state.journey,
    journey_state_status: journey_state.status,
    journey_state_current_step: journey_state.current_step,
    decision_kind: decision.kind,
    decision,
    decision_index: idx,
    decision_count: decisions.length,
  }))

  // If the router decided to drop nothing (e.g. parked gate), still emit
  // a single observability entry so log scrapers SEE that the handler
  // saw the event and reached "no-op" intentionally · canon §148, "no
  // op" is itself a decision and must be recorded.
  if (decisions.length === 0) {
    logger({
      canon: 'sala-shadow-router',
      mode: 'shadow',
      logged_at,
      trigger_event_id: trigger_event.event_id,
      trigger_event_type: trigger_event.event_type,
      stream_id: trigger_event.stream_id,
      correlation_id: trigger_event.correlation_id,
      tenant_id: trigger_event.tenant_id,
      client_id: trigger_event.client_id,
      journey_type: journey_state.journey,
      journey_state_status: journey_state.status,
      journey_state_current_step: journey_state.current_step,
      decision_kind: 'parked' as never, // no canonical kind for empty · sentinel
      decision: {
        kind: 'parked',
        reason: 'router returned empty Decision[] · branch is parked (e.g. gate pending)',
      } as unknown as Decision,
      decision_index: 0,
      decision_count: 0,
    })
  } else {
    for (const log of logs) {
      logger(log)
    }
  }

  return {
    trigger_event,
    journey_state,
    decisions,
    logs,
  }
}

// =====================================================================
// In-memory logger for tests · captures decisions + asserts shape
// =====================================================================

export interface InMemoryShadowLogger {
  readonly logger: ShadowLogger
  readonly entries: () => ReadonlyArray<ShadowDecisionLog>
  readonly clear: () => void
}

/**
 * Canon canonical · helper for tests that want to assert what the
 * handler would have logged in production without writing anything to
 * stdout. Drop-in replacement for `consoleShadowLogger`.
 */
export function createInMemoryShadowLogger(): InMemoryShadowLogger {
  const entries: ShadowDecisionLog[] = []
  return {
    logger: (entry) => {
      entries.push(entry)
    },
    entries: () => entries.slice(),
    clear: () => {
      entries.length = 0
    },
  }
}
