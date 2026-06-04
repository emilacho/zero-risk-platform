/**
 * Canon canonical · `sala-journey-state` types · Sprint 12 Fase 0 Ronda 3 Track F
 *
 * Spec · `SALA-FASE0-ronda3-router.md` Track F · proyección que el router lee
 * para saber "dónde está" cada cosa (journey + current_step + status).
 *
 * Canon canonical canon canon · pure function · derivada del event-log
 * append-only · cero estado mutable paralelo · replayable.
 *
 * Built on top of `src/lib/sala-event-log/` (Track A · PR #143).
 */

import type { EventType, GateType, StepState } from '@/lib/sala-event-log'

// =====================================================================
// Canon canonical · status enum · canon canon-canon-derivado del último estado significativo
// =====================================================================

/**
 * Canon canonical · 7 valores posibles del estado canon canonical-derivado.
 *
 * - `idle` · no events scanned (canon canon-canon-canonical-empty stream)
 * - `running` · canon canon-canon-canonical-step activo · canon canon-canon-canonical canon-canon-no pending gates/judgments
 * - `awaiting_gate` · 1+ `gate_pending` unresolved (canon canon-canon-canonical canon canon-router emite `gate_pending` o resuelve)
 * - `awaiting_judgment` · 1+ `needs_judgment` unresolved (canon canon-canon-canon canon-canonical canon-§H-a off-script handler)
 * - `blocked` · canon canon-canon-canonical canon-último event canon-canon-canonical-canon canon-`budget_blocked` · canon canon-canon-canonical canon-router decide retry/escalate
 * - `step_failed` · canon canon-canon-canonical canon-último step canon canon-canon-canon-canon-canon-canon-canon-canon-`step_failed` · canon canon-canon-canonical canon-router decide retry/handoff
 * - `step_done` · canon canon-canon-canonical canon-último step canon canon-canon-canon-canon canon-canon canon-canon-canon-`step_completed` sin handoff posterior (canon canon-canon-canonical canon-canon-canon-canon-canon-canonical-pending next dispatch)
 *
 * Canon canonical · canon canon-canon-NO incluye 'done' canon-canon-canon canon-canon canon-canon-canon-canon-canon canon-canon canon-(terminal) · ese veredicto lo da el router consultando el libreto · NO esta projection.
 */
export const JOURNEY_STATUSES = [
  'idle',
  'running',
  'awaiting_gate',
  'awaiting_judgment',
  'blocked',
  'step_failed',
  'step_done',
] as const

export type JourneyStatus = (typeof JOURNEY_STATUSES)[number]

// =====================================================================
// Canon canonical · pending items shape (gates + judgments)
// =====================================================================

/**
 * Canon canonical · un gate pendiente (canon canon-canon-canon canon-canon-`gate_pending` sin
 * `gate_resolved` matching). Canon canon canon-canon-canon canon-canonical-router
 * canon canon-emits `gate_pending` events → projection acumula · canon canon canon-canon canon-canon-canon canon-canon-`gate_resolved`
 * canon canon-canon-canon canon-canonical-pops by `causation_id`.
 */
export interface PendingGate {
  /** Canon canonical · event_id del gate_pending */
  event_id: string
  /** Canon canonical · ISO 8601 · occurred_at */
  opened_at: string
  /** Canon canonical · tipo del gate canon canon-canon-canon canon-canon-canon-canon-canonical-(hitl/camino_iii/§144) */
  gate_type: GateType
  /** Canon canonical · canon canon-canon-step_id donde se abrió canon canon-canon-canon-canon canon-canon-(si presente) */
  step_id: string | null
  /** Canon canonical · canon canon-canon-canon-correlation_id del flujo */
  correlation_id: string
}

/**
 * Canon canonical · un needs_judgment pendiente (canon canon-canon-canon canon-canon-`needs_judgment`
 * sin `judgment_resolved` matching). Canon canon-canon-canonical-§H-a off-script handler.
 */
export interface PendingJudgment {
  /** Canon canonical · event_id del needs_judgment */
  event_id: string
  /** Canon canonical · ISO 8601 · occurred_at */
  raised_at: string
  /** Canon canonical · canon canon-canon-step_id donde se abrió (si presente) */
  step_id: string | null
  /** Canon canonical · canon canon-canon-correlation_id */
  correlation_id: string
}

// =====================================================================
// Canon canonical · journey state shape · canon canonical the projection output
// =====================================================================

/**
 * Canon canonical · estado proyectado del journey por stream.
 *
 * Canon canon canon-canonical-todo lo que el router necesita para saber "dónde
 * está" un stream/campaign sin estado mutable paralelo. Replayable · canon canon canon-canon-canon-canon-canon-canon-canon-canon-canonical-rebuildable from log replay.
 *
 * **Out of scope · §148 honest** ·
 *   - `terminal` (done/aborted) · canon canon-canon-canon canon-canon-router decides via libreto · NOT here
 *   - retry strategy · canon canon-canon-canon canon-canon-router decides via libreto · NOT here
 *   - next_step suggestion · canon canon-canon-canon canon-canon-Track G interpreter owns · NOT here
 */
export interface JourneyState {
  /** Canon canonical · scope · canon canon-canon-canon-stream_id */
  stream_id: string
  /** Canon canonical · canon canon-canon-canon-tenant scope · RLS-respected */
  tenant_id: string
  /** Canon canonical · libreto/journey_type identificado por canon-eventos del log · canon-canon NULL si idle */
  journey: string | null
  /** Canon canonical · client_id · canon canon-canon-canon canon-canon canon-canon-derived from canon canon canon-canon-canon canon-events · canon-canon NULL si idle */
  client_id: string | null
  /** Canon canonical · current_step canon canon-canon-canon canon-canon-canon-step_id del último evento step-anchor · NULL si idle */
  current_step: string | null
  /** Canon canonical · canon canon-canon-canon canon-canon-step_state del current_step (mirror del último step event) · NULL si idle */
  current_step_state: StepState | null
  /** Canon canonical · derived status · canonical 7 values */
  status: JourneyStatus
  /** Canon canonical · gates pendientes (canon canon-canon-canonical-acumula gate_pending · gate_resolved pops) */
  pending_gates: PendingGate[]
  /** Canon canonical · needs_judgments pendientes */
  pending_judgments: PendingJudgment[]
  /** Canon canonical · count canon-canon-canon-budget_blocked acumulados (canon canon-canon-canonical-no se "resuelven" · canon canon-canon-canon-router decide retry) */
  budget_blocked_count: number
  /** Canon canonical · attempts del current_step (canon canon-canon-canon canon canon-canon-canon canon-canon canon-canon-mirror del último step event) */
  current_step_attempt: number | null
  /** Canon canonical · canon canon-canon-canon-correlation_id del flujo activo (último evento) · NULL si idle */
  correlation_id: string | null
  /** Canon canonical · canon canon-canon-canon-event_id del último evento · NULL si idle */
  last_event_id: string | null
  /** Canon canonical · canon canon-canon-canon-event_type del último evento · NULL si idle */
  last_event_type: EventType | null
  /** Canon canonical · ISO 8601 · occurred_at del último evento · NULL si idle */
  last_event_at: string | null
  /** Canon canonical · canon canon-canon-canon-sequence máxima · 0 si idle */
  last_sequence: number
  /** Canon canonical · canon canon-canon-canon-total events scanned · audit */
  total_events_scanned: number
  /** Canon canonical · ISO 8601 · canon canon-canon-canon-projected_at timestamp */
  projected_at: string
}

// =====================================================================
// Canon canonical · read helper input
// =====================================================================

export interface ReadJourneyStateInput {
  /** Canon canonical · RLS-scoped tenant */
  tenant_id: string
  /** Canon canonical · stream_id (canon-canon-canonical-campaign instance) */
  stream_id: string
  /** Optional canon canonical · canon canon-canon-canon-time window canon-canon-projection up to this point */
  until?: string
  /** Optional canon canonical · canon canon-canon-canon-time window canon-canon-start from */
  since?: string
  /** Optional canon canonical · canon canon-canon-canon-max events to scan · default 1000 */
  max_events?: number
}
