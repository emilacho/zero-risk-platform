/**
 * Canon canonical · `sala-integration` types · Sprint 12 Fase 0 Ronda 3 Track K
 *
 * Spec · `SALA-FASE0-ronda3-router.md` §8 · integración shadow E2E del
 * substrate (4 libs CC#1 + motor CC#4 + libretos CC#4). Router (H) +
 * Interpreter (G) quedan STUB hasta aterrice · canon canon-cuando aterricen ·
 * canon canon-canon canon-canon-replazar stubs por implementaciones reales.
 *
 * Built on top of:
 *  - sala-event-log (Track A · PR #143)
 *  - sala-event-log/storage/supabase (Track J · PR #147)
 *  - sala-blackboard (Track D · PR #144)
 *  - sala-journey-state (Track F · PR #146)
 *  - sala/executor-contract + InngestExecutor (Track B · PR #142)
 *  - sala/libretos (Track E · PR #145)
 */

import type { EventLogStorage, EventType } from '@/lib/sala-event-log'
import type { BlackboardState } from '@/lib/sala-blackboard'
import type { JourneyState } from '@/lib/sala-journey-state'
import type { Libreto, NextStepRef, Step } from '@/lib/sala/libretos/types'

// =====================================================================
// Stub Router (Track H placeholder)
// =====================================================================

/**
 * Canon canonical · canon canon-the decision a router emits per event.
 *
 * Track H (CC#3) implementará la canónica · este STUB satisface la
 * forma canónica para que el loop integration funcione end-to-end.
 *
 * 5 outcomes (canon canon-canon-función TOTAL · cero drop silente):
 *   - dispatch · canon canon-canon-emit a step_started event + run motor
 *   - gate_pending · canon canon-canon-emit a gate_pending event (camino/hitl/§144)
 *   - terminal · canon canon-canon-emit final step_completed event · journey done
 *   - needs_judgment · canon canon-canon-emit needs_judgment event (§H-a)
 *   - budget_blocked · canon canon-canon-emit budget_blocked event (G6)
 */
export type DispatchDecision =
  | {
      readonly kind: 'dispatch'
      readonly step_id: string
      readonly agent_id: string
      readonly operation_type: string
    }
  | {
      readonly kind: 'gate_pending'
      readonly step_id: string
      readonly gate_type: 'hitl' | 'camino_iii' | '§144'
    }
  | { readonly kind: 'terminal'; readonly step_id: string; readonly outcome: 'success' | 'failure' }
  | { readonly kind: 'needs_judgment'; readonly reason: string }
  | { readonly kind: 'budget_blocked'; readonly bucket_key: string }

/**
 * Canon canonical · Stub Router interface · canon canon-Track H lo
 * implementará real cuando aterrice.
 */
export interface StubRouter {
  decide(ctx: RouterContext): DispatchDecision
}

export interface RouterContext {
  readonly journey: JourneyState
  readonly blackboard: BlackboardState
  readonly libreto: Libreto
}

// =====================================================================
// Stub Interpreter (Track G placeholder)
// =====================================================================

/**
 * Canon canonical · canon canon-resolves NextStepRef → concrete step_id.
 *
 * Track G (CC#4) implementará un evaluador canon-de predicados nombrados +
 * JSONPath sobre el blackboard. Este STUB evalúa static refs y
 * conditional refs con predicados básicos.
 */
export interface StubInterpreter {
  resolveNextStep(
    libreto: Libreto,
    current_step_id: string,
    blackboard: BlackboardState,
  ): NextStepResolution
}

export type NextStepResolution =
  | { readonly kind: 'next'; readonly step: Step }
  | { readonly kind: 'terminal'; readonly step: Step }
  | { readonly kind: 'unknown'; readonly target: string }

// =====================================================================
// Integration harness shape
// =====================================================================

export interface SalaIntegrationConfig {
  readonly storage: EventLogStorage
  readonly router: StubRouter
  readonly interpreter: StubInterpreter
}

export interface RunStepInput {
  readonly tenant_id: string
  readonly client_id: string
  readonly stream_id: string
  readonly correlation_id?: string
  readonly journey_type: import('@/lib/sala/libretos/types').JourneyType
  readonly logical_period: string
}

/**
 * Canon canonical · canon canon-the result of one harness "tick" ·
 * what just happened in the loop.
 */
export interface RunStepResult {
  /** Canon canonical · what the router decided this tick. */
  readonly decision: DispatchDecision
  /** Canon canonical · the event(s) appended this tick (1-2 typically). */
  readonly events_appended: ReadonlyArray<{ event_id: string; event_type: EventType; sequence: number }>
  /** Canon canonical · the journey state AFTER the tick. */
  readonly journey_state: JourneyState
  /** Canon canonical · the blackboard state AFTER the tick. */
  readonly blackboard_state: BlackboardState
}
