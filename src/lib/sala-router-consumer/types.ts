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

// ---------------------------------------------------------------------
// Regla de Lenovo · 2026-09-07 · "sólo se marca lo que efectivamente se
// despachó". Antes la marca de arriba se escribía en CINCO de los seis
// desenlaces —incluido cuando el disparo FALLABA— y como el SELECT de
// pendientes excluye por ese prefijo, el sobre quedaba consumido para
// siempre: un fallo se leía igual que un éxito. Medido 2026-09-07 (CC#2).
//
// Ahora hay TRES espacios de nombres y cada uno dice una cosa distinta:
//   router.dispatch.*  → SE DESPACHÓ · excluye el hilo (terminal, correcto)
//   router.attempt.*   → NO se despachó · NO excluye · CUENTA el intento
//   router.giveup.*    → se agotó el tope · excluye · y deja el MOTIVO visible
// ---------------------------------------------------------------------

/** Canon canonical · prefijo del evento de INTENTO fallido. NO excluye el
 *  hilo: el sobre vuelve a la fila en el próximo tick. Sólo cuenta. */
export const ATTEMPT_MARKER_PREFIX = 'router.attempt.'

/** Canon canonical · prefijo del abandono declarado. Excluye el hilo —
 *  pero a diferencia de la marca de despacho, dice en su payload que NO
 *  se despachó y por qué. Un fallo callado es peor que un fallo. */
export const GIVEUP_MARKER_PREFIX = 'router.giveup.'

/** Canon canonical · tope de intentos por sobre antes de abandonar.
 *  §150 · un reintento sin límite es otro problema, no la solución.
 *  3 = mismo tope que el resto del sistema (retries cap = 3). */
export const MAX_DISPATCH_ATTEMPTS = 3

// ---------------------------------------------------------------------
// PAQUETE DEL REPARTIDOR · CC#1 · 2026-09-30 · palanca SALA_ROUTER_PAQUETE_ENABLED (nace APAGADA).
//   router.claim.*      → SE RECLAMÓ el sobre ANTES de disparar · EXCLUYE el hilo (si el tic muere o el disparo no vuelve, NO se re-dispara: se pierde en vez de duplicarse)
//   router.lostalert.*  → el vigilante ya avisó de un reclamo sin desenlace (para avisar UNA sola vez)
// ---------------------------------------------------------------------
export const CLAIM_MARKER_PREFIX = 'router.claim.'
export const LOST_ALERT_MARKER_PREFIX = 'router.lostalert.'
/** tope de tiempo del tic (pieza ②): muy por encima de lo normal (0-9 s) y por debajo de cualquier ciclo */
export const TICK_DEADLINE_MS_DEFAULT = 60_000
/** el candado vence solo si su dueño muere (pieza ①) · un poco más que el tope de tiempo */
export const TICK_LOCK_TTL_MS = 90_000
/** un reclamo sin desenlace más viejo que esto es un sobre PERDIDO (pieza ⑤) · un despacho sano tarda segundos */
export const CLAIM_STALE_MS = 5 * 60_000

/** Canon canonical · un sobre reclamado que no llegó a desenlace */
export interface LostClaim {
  readonly stream_id: string
  readonly claim_event_id: string
  readonly claimed_at: string
  readonly age_ms: number
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: string
  readonly intake_event_id: string | null
}

/** Canon canonical · el ÚNICO desenlace que puede escribir la marca de
 *  despacho. Todo lo demás cuenta como intento (o abandono al tope). */
export const DISPATCHED_KIND = 'dispatched_ok'

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
  /** PAQUETE · otro tic ya reclamó este sobre (no se dispara dos veces) */
  | 'skipped_already_claimed'

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
  /** PAQUETE · true si el tope de tiempo cortó el recorrido de la fila (lo que quedó se toma en el próximo tic) */
  readonly stopped_by_deadline?: boolean
  /** PAQUETE · sobres reclamados sin desenlace hallados en este tic (el vigilante) */
  readonly lost_claims?: ReadonlyArray<LostClaim>
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
