/**
 * Canon canonical · Sala Integration Harness · Sprint 12 Fase 0 Ronda 3 Track K
 *
 * Spec · `SALA-FASE0-ronda3-router.md` §8 · shadow E2E que compone:
 *   - event-log lib (Track A)
 *   - blackboard projection (Track D)
 *   - journey-state projection (Track F)
 *   - libretos data (Track E · CC#4)
 *   - stub router (Track H placeholder · CC#3 aterrice)
 *   - stub interpreter (Track G placeholder · CC#4 aterrice)
 *
 * Motor canon canon-canon · canon canon-`SalaExecutor` se canon-instancia
 * fuera del harness (canon-tests deciden si usar in-memory motor o stub) ·
 * canon canon-canon-este harness solo orquesta el LOOP append→project→
 * decide→append. El motor real se wirea cuando el router lo invoca real ·
 * Mitad 2 · §144.
 *
 * **Shadow only** · canon-NO router enforce real · canon-NO motor live ·
 * canon-NO migration apply · canon-NO prod. canon canon-cuando Tracks G/H
 * aterricen + §144 sign-off, canon-canon-replace stubs por reales.
 */
import { randomUUID } from 'node:crypto'
import {
  append,
  buildIdempotencyKey,
  type EventAppendInput,
  type EventLogStorage,
  type EventType,
} from '@/lib/sala-event-log'
import { readBlackboard } from '@/lib/sala-blackboard'
import { readJourneyState } from '@/lib/sala-journey-state'
import { getLibreto } from '@/lib/sala/libretos'
import type {
  DispatchDecision,
  RunStepInput,
  RunStepResult,
  SalaIntegrationConfig,
  StubInterpreter,
  StubRouter,
} from './types'

export class SalaIntegration {
  private readonly storage: EventLogStorage
  private readonly router: StubRouter
  // canon canon · interpreter is canon canon-injected to router via options
  // canon canon · keeping reference here for canon canon-canon-testability + future direct calls
  private readonly _interpreter: StubInterpreter

  constructor(config: SalaIntegrationConfig) {
    this.storage = config.storage
    this.router = config.router
    this._interpreter = config.interpreter
  }

  /**
   * Canon canonical · ejecuta UN tick del loop.
   *
   * Steps canonical:
   *   1. Read journey state (proyección)
   *   2. Read blackboard (proyección)
   *   3. Look up libreto
   *   4. Stub-router.decide({journey, blackboard, libreto}) → DispatchDecision
   *   5. Translate DispatchDecision → 1-2 events appended to log
   *   6. Re-read projections POST-append
   *   7. Return result
   *
   * §148 honest · canon-NO ejecuta agente real · canon-NO ejecuta motor real ·
   * canon canon-este harness solo demuestra que el loop append→project→decide→
   * append funciona. El motor real entra en Mitad 2 (post-§144).
   */
  async runStep(input: RunStepInput): Promise<RunStepResult> {
    const correlation_id = input.correlation_id ?? randomUUID()

    // canon · canon canon-canon-read current state (projections from log)
    const journey = await readJourneyState(this.storage, {
      tenant_id: input.tenant_id,
      stream_id: input.stream_id,
    })
    const blackboard = await readBlackboard(this.storage, {
      tenant_id: input.tenant_id,
      campaign_id: input.stream_id,
    })

    // canon · canon canon-canon-find libreto for journey_type
    const libreto = getLibreto(input.journey_type)
    if (!libreto) {
      throw new Error(
        `SalaIntegration · canon canon-canon-libreto not found for journey_type=${input.journey_type}`,
      )
    }

    // canon · canon canon-canon-router decides
    const decision = this.router.decide({
      journey,
      blackboard,
      libreto,
    })

    // canon · canon canon-canon-translate decision to events
    const appended = await this.applyDecision(decision, input, correlation_id, journey)

    // canon · canon canon-canon-re-read state post-append
    const journey_state = await readJourneyState(this.storage, {
      tenant_id: input.tenant_id,
      stream_id: input.stream_id,
    })
    const blackboard_state = await readBlackboard(this.storage, {
      tenant_id: input.tenant_id,
      campaign_id: input.stream_id,
    })

    return { decision, events_appended: appended, journey_state, blackboard_state }
  }

  /**
   * Canon canonical · ejecuta UNTIL canon-terminal/gate/judgment/blocked.
   *
   * Útil para tests E2E · canon-loops runStep() hasta que el journey
   * llega a un estado donde no se puede avanzar sin intervención
   * (gate · needs_judgment · budget_blocked · terminal).
   *
   * Cap canónico · canon-`max_ticks` (default 50) para evitar bucles
   * infinitos en stubs · canon-test failure si excede.
   */
  async runUntilHalt(
    input: RunStepInput & { max_ticks?: number },
  ): Promise<{
    last_result: RunStepResult
    ticks: number
    halted_by: 'terminal' | 'gate_pending' | 'needs_judgment' | 'budget_blocked' | 'max_ticks'
  }> {
    const cap = input.max_ticks ?? 50
    let ticks = 0
    let lastResult: RunStepResult | null = null

    while (ticks < cap) {
      ticks++
      const result = await this.runStep(input)
      lastResult = result
      const k = result.decision.kind
      if (k === 'terminal' || k === 'gate_pending' || k === 'needs_judgment' || k === 'budget_blocked') {
        return { last_result: result, ticks, halted_by: k }
      }
    }

    if (!lastResult) {
      throw new Error('SalaIntegration · canon canon-canon-runUntilHalt called with max_ticks=0')
    }
    return { last_result: lastResult, ticks, halted_by: 'max_ticks' }
  }

  // ─────────────────────────────────────────────────────────────────────
  // canon canonical · privates
  // ─────────────────────────────────────────────────────────────────────

  private async applyDecision(
    decision: DispatchDecision,
    input: RunStepInput,
    correlation_id: string,
    journey: import('@/lib/sala-journey-state').JourneyState,
  ): Promise<Array<{ event_id: string; event_type: EventType; sequence: number }>> {
    const causation_id = journey.last_event_id

    if (decision.kind === 'dispatch') {
      // canon · canon canon-canon-emit dispatch_requested + step_started + step_completed
      // canon · canon canon-canon-(stub motor · canon canon-canon-no real agent call)
      const dispatchedEvent = await this.appendEvent({
        input,
        correlation_id,
        causation_id,
        event_type: 'dispatch_requested',
        journey_type: input.journey_type,
        operation_type: decision.operation_type,
        step_id: decision.step_id,
        suffix: 'dispatch',
      })
      const startedEvent = await this.appendEvent({
        input,
        correlation_id,
        causation_id: dispatchedEvent.event_id,
        event_type: 'step_started',
        journey_type: input.journey_type,
        operation_type: decision.operation_type,
        step_id: decision.step_id,
        step_state: 'running',
        attempt: 1,
        suffix: 'start',
      })
      // canon · canon canon-canon-stub motor result · canon canon-canon-simulated artifact write
      const completedEvent = await this.appendEvent({
        input,
        correlation_id,
        causation_id: startedEvent.event_id,
        event_type: 'step_completed',
        journey_type: input.journey_type,
        operation_type: decision.operation_type,
        step_id: decision.step_id,
        step_state: 'done',
        attempt: 1,
        suffix: 'complete',
        payload: {
          artifact_writes: [
            {
              key: `${decision.step_id}_output`,
              value: { stub: true, agent_id: decision.agent_id },
              written_by: decision.agent_id,
            },
          ],
        },
      })
      return [dispatchedEvent, startedEvent, completedEvent]
    }

    if (decision.kind === 'gate_pending') {
      const ev = await this.appendEvent({
        input,
        correlation_id,
        causation_id,
        event_type: 'gate_pending',
        journey_type: input.journey_type,
        operation_type: `${input.journey_type}.${decision.step_id}.gate`,
        step_id: decision.step_id,
        gate_type: decision.gate_type,
        suffix: 'gate',
      })
      return [ev]
    }

    if (decision.kind === 'terminal') {
      const ev = await this.appendEvent({
        input,
        correlation_id,
        causation_id,
        event_type: decision.outcome === 'success' ? 'step_completed' : 'step_failed',
        journey_type: input.journey_type,
        operation_type: `${input.journey_type}.${decision.step_id}.terminal`,
        step_id: decision.step_id,
        step_state: decision.outcome === 'success' ? 'done' : 'failed',
        suffix: 'terminal',
        payload: { terminal: true, outcome: decision.outcome },
      })
      return [ev]
    }

    if (decision.kind === 'needs_judgment') {
      const ev = await this.appendEvent({
        input,
        correlation_id,
        causation_id,
        event_type: 'needs_judgment',
        journey_type: input.journey_type,
        operation_type: `${input.journey_type}.judgment`,
        step_id: journey.current_step ?? null,
        suffix: 'judgment',
        payload: { reason: decision.reason },
      })
      return [ev]
    }

    if (decision.kind === 'budget_blocked') {
      const ev = await this.appendEvent({
        input,
        correlation_id,
        causation_id,
        event_type: 'budget_blocked',
        journey_type: input.journey_type,
        operation_type: `${input.journey_type}.budget`,
        step_id: journey.current_step ?? null,
        suffix: 'budget',
        payload: { bucket_key: decision.bucket_key },
      })
      return [ev]
    }

    // canon · canon canon-canon-exhaustive · TS verifies all kinds handled
    const _exhaustive: never = decision
    void _exhaustive
    return []
  }

  private async appendEvent(params: {
    input: RunStepInput
    correlation_id: string
    causation_id: string | null
    event_type: EventType
    journey_type: string
    operation_type: string
    step_id?: string | null
    step_state?: 'pending' | 'running' | 'done' | 'failed'
    attempt?: number
    gate_type?: 'hitl' | 'camino_iii' | '§144'
    suffix: string
    payload?: Record<string, unknown>
  }): Promise<{ event_id: string; event_type: EventType; sequence: number }> {
    const idempotency_key = buildIdempotencyKey({
      operation_type: `${params.operation_type}::${params.suffix}::${randomUUID()}`,
      client_id: params.input.client_id,
      logical_period: params.input.logical_period,
    })

    const eventInput: EventAppendInput = {
      tenant_id: params.input.tenant_id,
      client_id: params.input.client_id,
      stream_id: params.input.stream_id,
      correlation_id: params.correlation_id,
      causation_id: params.causation_id,
      event_type: params.event_type,
      journey_type: params.journey_type,
      operation_type: params.operation_type,
      idempotency_key,
      logical_period: params.input.logical_period,
      step_id: params.step_id ?? null,
      step_state: params.step_state ?? null,
      attempt: params.attempt ?? null,
      payload: params.payload ?? {},
      gate_type: params.gate_type ?? null,
    }

    const result = await append(this.storage, eventInput)
    return {
      event_id: result.event.event_id,
      event_type: result.event.event_type,
      sequence: result.event.sequence,
    }
  }
}
