/**
 * Canon canonical · Real-wire integration harness · Sprint 12 Fase 0 Ronda 3 Track L
 *
 * Spec · `SALA-FASE0-ronda3-router.md` §9 · convergencia · swap stubs → reales.
 *
 * Composes los 4 libs CC#1 + motor (CC#4 PR #142) + libretos (CC#4 PR #145)
 * + **interpreter real** (CC#4 PR #148 Track G) + **router real** (CC#3 PR
 * #149 Track H) en un loop E2E shadow.
 *
 * Key diferencia con `SalaIntegration` (Track K stubs):
 *   - Aquí el ROUTER es event-driven · canon-cada call a decide() consume
 *     un PersistedEvent y produce Decision[]
 *   - El INTERPRETER es el real (Track G) vía adapter (interpreter-adapter.ts)
 *   - El loop se conduce por eventos · cada Decision produce más eventos
 *     que disparan más decisiones
 *
 * Shadow only · cero motor real ejecutado · cero prod.
 */
import { randomUUID } from 'node:crypto'
import {
  append,
  buildIdempotencyKey,
  type EventAppendInput,
  type EventLogStorage,
  type EventType,
  type PersistedEvent,
} from '@/lib/sala-event-log'
import { readJourneyState } from '@/lib/sala-journey-state'
import {
  CANONICAL_LIBRETOS,
  type JourneyType,
} from '@/lib/sala/libretos'
import {
  allowAllBudgetStub,
  decide,
  type BudgetCheckFn,
  type Decision,
  type LibretoLookup,
  type ResolveNextStepFn,
} from '@/lib/sala-router'
import { createInterpreterAdapter } from './interpreter-adapter'

export interface RealSalaIntegrationConfig {
  readonly storage: EventLogStorage
  /** Canon canonical · default canonicalPredicateRegistry · canon-tests pueden inyectar custom */
  readonly resolve_next_step?: ResolveNextStepFn
  /** Canon canonical · default allowAllBudgetStub · canon-tests pueden inyectar denyByKeyBudgetStub */
  readonly budget_check?: BudgetCheckFn
  /** Canon canonical · default getLibreto from canonical registry */
  readonly libreto_lookup?: LibretoLookup
}

export interface KickstartInput {
  readonly tenant_id: string
  readonly client_id: string
  readonly stream_id: string
  readonly journey_type: JourneyType
  readonly logical_period: string
  readonly correlation_id?: string
  /** Canon canonical · optional payload for the kickstart event */
  readonly payload?: Record<string, unknown>
}

export interface ProcessEventResult {
  readonly trigger_event: PersistedEvent
  readonly decisions: Decision[]
  readonly events_appended: ReadonlyArray<{
    event_id: string
    event_type: EventType
    sequence: number
  }>
}

/**
 * Canon canonical · Track T (Step 11 resume gap · 2026-06-04) · external
 * surface for resolving a gate. The MC inbox UI, the Camino III voting
 * workflow, or a §144 approval path all call this method to land a
 * `gate_resolved` event into the log · the projection then pops the
 * gate and the router re-decides post-gate.
 *
 * `gate_event_id` is the event_id of the original `gate_pending` event
 * (returned by `runUntilHalt` / `processEvent` when a gate was opened).
 * `outcome` selects between `gate.next_step` (approved) and
 * `gate.next_step_rejected` (rejected) per the interpreter adapter.
 *
 * §148 honest · this method APPENDS the resolution event AND processes
 * it through the router immediately (single tick). The caller does not
 * need to re-trigger the loop · the returned `ProcessEventResult` is
 * the router's reaction to the resume. Use `runUntilHalt` afterwards if
 * post-gate work involves multiple action steps before the next halt.
 */
export interface ResolveGateInput {
  readonly tenant_id: string
  readonly stream_id: string
  readonly gate_event_id: string
  readonly outcome: 'approved' | 'rejected'
  readonly resolved_by?: string
  readonly payload?: Record<string, unknown>
}

export interface RunUntilHaltResult {
  readonly ticks: number
  readonly halted_by:
    | 'gate_pending'
    | 'terminal'
    | 'needs_judgment'
    | 'budget_blocked'
    | 'no_dispatch_emitted'
    | 'max_ticks'
  readonly last_decisions: Decision[]
  readonly total_events: number
}

const DEFAULT_LIBRETO_LOOKUP: LibretoLookup = (journey_type) =>
  CANONICAL_LIBRETOS[journey_type as JourneyType] ?? undefined

export class RealSalaIntegration {
  private readonly storage: EventLogStorage
  private readonly resolveNextStep: ResolveNextStepFn
  private readonly budgetCheck: BudgetCheckFn
  private readonly libretoLookup: LibretoLookup

  constructor(config: RealSalaIntegrationConfig) {
    this.storage = config.storage
    this.resolveNextStep = config.resolve_next_step ?? createInterpreterAdapter()
    this.budgetCheck = config.budget_check ?? allowAllBudgetStub
    this.libretoLookup = config.libreto_lookup ?? DEFAULT_LIBRETO_LOOKUP
  }

  /**
   * Canon canonical · append a kickstart event to begin a stream.
   *
   * Canon canon · the router responds to event arrivals · the canonical
   * pattern is to append `step_completed` at entry_step_id (canon-
   * as if a synthetic pre-step finished). The router then sees
   * "entry_step is done · what's next?" and emits the appropriate
   * dispatch/gate/terminal canon-decision for the SECOND step in the
   * libreto. Canon canon-when Mitad 2 wires the executor, that executor's
   * step_completed callback follows the same pattern.
   *
   * §148 honest · canon canon-canon-this is a stream-initiation convention
   * (Mitad 2 may evolve · canon canon-router design owns the canonical
   * "how does a stream start" question).
   */
  async kickstart(input: KickstartInput): Promise<PersistedEvent> {
    const correlation_id = input.correlation_id ?? randomUUID()
    const libreto = this.libretoLookup(input.journey_type)
    if (!libreto) {
      throw new Error(`kickstart · canon canon-canon-libreto not found for ${input.journey_type}`)
    }
    const idempotency_key = buildIdempotencyKey({
      operation_type: `${input.journey_type}.${libreto.entry_step_id}.kickstart`,
      client_id: input.client_id,
      logical_period: `${input.logical_period}::${randomUUID()}`,
    })
    const eventInput: EventAppendInput = {
      tenant_id: input.tenant_id,
      client_id: input.client_id,
      stream_id: input.stream_id,
      correlation_id,
      causation_id: null,
      event_type: 'step_completed',
      journey_type: input.journey_type,
      operation_type: `${input.journey_type}.${libreto.entry_step_id}`,
      idempotency_key,
      logical_period: input.logical_period,
      step_id: libreto.entry_step_id,
      step_state: 'done',
      payload: input.payload ?? {},
      gate_type: null,
    }
    const result = await append(this.storage, eventInput)
    return result.event
  }

  /**
   * Canon canonical · process a single event through the real router.
   *
   * Loop:
   *   1. Read journey state (projection from log)
   *   2. Call decide({event, journey_state, libreto_lookup, resolve_next_step, budget_check})
   *   3. Translate each Decision to event(s) appended to log
   *   4. Return trigger + decisions + appended events
   */
  async processEvent(trigger: PersistedEvent): Promise<ProcessEventResult> {
    const journey_state = await readJourneyState(this.storage, {
      tenant_id: trigger.tenant_id,
      stream_id: trigger.stream_id,
    })

    const decisions = await decide({
      event: trigger,
      journey_state,
      libreto_lookup: this.libretoLookup,
      resolve_next_step: this.resolveNextStep,
      budget_check: this.budgetCheck,
    })

    const appended: Array<{ event_id: string; event_type: EventType; sequence: number }> = []

    for (const dec of decisions) {
      const events = await this.applyRealDecision(dec, trigger)
      appended.push(...events)
    }

    return { trigger_event: trigger, decisions, events_appended: appended }
  }

  /**
   * Canon canonical · Track T (Step 11 resume gap · 2026-06-04) ·
   * append a `gate_resolved` event and process it through the router.
   *
   * Validation · the referenced `gate_event_id` must (a) exist in the
   * stream, (b) be of `event_type = 'gate_pending'`, (c) not already
   * have a `gate_resolved` event with `causation_id = gate_event_id`
   * (replay-idempotency). All three failures throw cero-silent-drop.
   *
   * §148 honest · this is the SHADOW path · production use cases must
   * also write to legacy `pipeline_steps.hitl_status` if MC inbox UI
   * reads from that table (dual-write window during migration). That
   * dual-write is the `/api/sala/hitl/resolve` API surface (§144 gated)
   * and lives outside this harness · this method only owns the canon
   * event-log side.
   */
  async resolveGate(input: ResolveGateInput): Promise<ProcessEventResult> {
    const rows = await this.storage.select({
      tenant_id: input.tenant_id,
      stream_id: input.stream_id,
    })
    const gateEvent = rows.find((r) => r.event_id === input.gate_event_id)
    if (!gateEvent) {
      throw new Error(
        `resolveGate · gate event ${input.gate_event_id} not found in stream ${input.stream_id}`,
      )
    }
    if (gateEvent.event_type !== 'gate_pending') {
      throw new Error(
        `resolveGate · event ${input.gate_event_id} is ${gateEvent.event_type} · expected gate_pending`,
      )
    }
    const alreadyResolved = rows.some(
      (r) => r.event_type === 'gate_resolved' && r.causation_id === input.gate_event_id,
    )
    if (alreadyResolved) {
      throw new Error(
        `resolveGate · gate ${input.gate_event_id} already has a gate_resolved event (replay rejected)`,
      )
    }

    const idempotency_key = buildIdempotencyKey({
      operation_type: `${gateEvent.journey_type}.${gateEvent.step_id ?? 'gate'}.gate_resolved`,
      client_id: gateEvent.client_id,
      logical_period: `${gateEvent.logical_period}::resolve::${input.gate_event_id}`,
    })
    const resolvedInput: EventAppendInput = {
      tenant_id: gateEvent.tenant_id,
      client_id: gateEvent.client_id,
      stream_id: gateEvent.stream_id,
      correlation_id: gateEvent.correlation_id,
      causation_id: gateEvent.event_id,
      event_type: 'gate_resolved',
      journey_type: gateEvent.journey_type,
      operation_type: `${gateEvent.journey_type}.${gateEvent.step_id ?? 'gate'}.gate_resolved`,
      idempotency_key,
      logical_period: gateEvent.logical_period,
      step_id: gateEvent.step_id,
      payload: {
        outcome: input.outcome,
        resolved_by: input.resolved_by ?? 'system',
        ...(input.payload ?? {}),
      },
      gate_type: gateEvent.gate_type,
    }
    const appendResult = await append(this.storage, resolvedInput)
    return await this.processEvent(appendResult.event)
  }

  /**
   * Canon canonical · loop the harness until canon canon-halt condition.
   *
   * Steps:
   *   1. kickstart (canon-canon-canon-creates initial dispatch_requested)
   *   2. processEvent loop · feed last-emitted event back as trigger
   *   3. Halt when canon canon-canon-decisions emits gate/terminal/judgment/budget
   *      OR when canon canon-canon-no new dispatch is emitted (stable state)
   *
   * Cap canon canonical · canon-`max_ticks` default 50 defensive.
   */
  async runUntilHalt(input: KickstartInput & { max_ticks?: number }): Promise<RunUntilHaltResult> {
    const cap = input.max_ticks ?? 50
    const initial = await this.kickstart(input)

    let ticks = 0
    let currentTrigger: PersistedEvent = initial
    let lastDecisions: Decision[] = []
    let halted: RunUntilHaltResult['halted_by'] = 'max_ticks'

    while (ticks < cap) {
      ticks++
      const result = await this.processEvent(currentTrigger)
      lastDecisions = result.decisions

      // canon · canon canon-canon-check halt conditions
      const stop = result.decisions.find(
        (d) =>
          d.kind === 'gate_pending' ||
          d.kind === 'terminal' ||
          d.kind === 'needs_judgment' ||
          d.kind === 'budget_blocked',
      )
      if (stop) {
        halted = stop.kind
        break
      }

      // canon · canon canon-canon-find next trigger from emitted events
      if (result.events_appended.length === 0) {
        halted = 'no_dispatch_emitted'
        break
      }
      // canon · canon canon-canon-the last appended event becomes the next trigger
      const last = result.events_appended[result.events_appended.length - 1]!
      const journey_state = await readJourneyState(this.storage, {
        tenant_id: input.tenant_id,
        stream_id: input.stream_id,
      })
      // canon · canon canon-canon-we need the full PersistedEvent shape · canon-read it via select
      const rows = await this.storage.select({
        tenant_id: input.tenant_id,
        stream_id: input.stream_id,
        order: 'sequence_desc',
        limit: 1,
      })
      void journey_state
      void last
      if (rows.length === 0) {
        halted = 'no_dispatch_emitted'
        break
      }
      currentTrigger = rows[0]!
    }

    const finalRows = await this.storage.select({
      tenant_id: input.tenant_id,
      stream_id: input.stream_id,
      limit: 1000,
    })

    return {
      ticks,
      halted_by: halted,
      last_decisions: lastDecisions,
      total_events: finalRows.length,
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // canon canonical · privates
  // ─────────────────────────────────────────────────────────────────────

  private async applyRealDecision(
    decision: Decision,
    trigger: PersistedEvent,
  ): Promise<Array<{ event_id: string; event_type: EventType; sequence: number }>> {
    if (decision.kind === 'dispatch') {
      // canon · canon canon-canon-emit step_started + step_completed (canon-stub motor outcome)
      const started = await this.appendDispatchEvent({
        decision,
        trigger,
        event_type: 'step_started',
        step_state: 'running',
        suffix: 'start',
      })
      const completed = await this.appendDispatchEvent({
        decision,
        trigger,
        event_type: 'step_completed',
        step_state: 'done',
        suffix: 'complete',
        causation_id: started.event_id,
      })
      return [started, completed]
    }

    if (decision.kind === 'gate_pending') {
      const ev = await this.appendGateEvent(decision, trigger)
      return [ev]
    }

    if (decision.kind === 'terminal') {
      const ev = await this.appendTerminalEvent(decision, trigger)
      return [ev]
    }

    if (decision.kind === 'needs_judgment') {
      const ev = await this.appendJudgmentEvent(decision, trigger)
      return [ev]
    }

    if (decision.kind === 'budget_blocked') {
      const ev = await this.appendBudgetEvent(decision, trigger)
      return [ev]
    }

    // canon · canon canon-canon-exhaustive
    const _exhaustive: never = decision
    void _exhaustive
    return []
  }

  private async appendDispatchEvent(args: {
    decision: Extract<Decision, { kind: 'dispatch' }>
    trigger: PersistedEvent
    event_type: 'step_started' | 'step_completed'
    step_state: 'running' | 'done'
    suffix: string
    causation_id?: string
  }): Promise<{ event_id: string; event_type: EventType; sequence: number }> {
    const { decision, trigger } = args
    const idempotency_key = buildIdempotencyKey({
      operation_type: `${decision.idempotency_inputs.operation_type}::${args.suffix}::${randomUUID()}`,
      client_id: decision.client_id,
      logical_period: decision.idempotency_inputs.logical_period,
    })
    const eventInput: EventAppendInput = {
      tenant_id: decision.tenant_id,
      client_id: decision.client_id,
      stream_id: decision.stream_id,
      correlation_id: decision.correlation_id,
      causation_id: args.causation_id ?? decision.caused_by_event_id,
      event_type: args.event_type,
      journey_type: decision.journey_type,
      operation_type: decision.idempotency_inputs.operation_type,
      idempotency_key,
      logical_period: decision.idempotency_inputs.logical_period,
      step_id: decision.step_id,
      step_state: args.step_state,
      attempt: decision.attempt,
      payload:
        args.event_type === 'step_completed'
          ? {
              artifact_writes: [
                {
                  key: `${decision.step_id}_output`,
                  value: { stub: true, agent_id: decision.agent_id },
                  written_by: decision.agent_id,
                },
              ],
            }
          : {},
      gate_type: null,
    }
    const result = await append(this.storage, eventInput)
    void trigger
    return {
      event_id: result.event.event_id,
      event_type: result.event.event_type,
      sequence: result.event.sequence,
    }
  }

  private async appendGateEvent(
    decision: Extract<Decision, { kind: 'gate_pending' }>,
    trigger: PersistedEvent,
  ): Promise<{ event_id: string; event_type: EventType; sequence: number }> {
    void trigger
    const eventInput: EventAppendInput = {
      tenant_id: decision.tenant_id,
      client_id: decision.client_id,
      stream_id: decision.stream_id,
      correlation_id: decision.correlation_id,
      causation_id: decision.caused_by_event_id,
      event_type: 'gate_pending',
      journey_type: decision.journey_type,
      operation_type: decision.idempotency_inputs.operation_type,
      idempotency_key: decision.idempotency_key,
      logical_period: decision.idempotency_inputs.logical_period,
      step_id: decision.step_id,
      payload: {},
      gate_type: decision.gate_type,
    }
    const result = await append(this.storage, eventInput)
    return {
      event_id: result.event.event_id,
      event_type: result.event.event_type,
      sequence: result.event.sequence,
    }
  }

  private async appendTerminalEvent(
    decision: Extract<Decision, { kind: 'terminal' }>,
    trigger: PersistedEvent,
  ): Promise<{ event_id: string; event_type: EventType; sequence: number }> {
    void trigger
    const idempotency_key = buildIdempotencyKey({
      operation_type: `${decision.journey_type}.${decision.step_id}.terminal`,
      client_id: decision.client_id,
      logical_period: `${randomUUID()}::terminal`,
    })
    const eventInput: EventAppendInput = {
      tenant_id: decision.tenant_id,
      client_id: decision.client_id,
      stream_id: decision.stream_id,
      correlation_id: decision.correlation_id,
      causation_id: decision.caused_by_event_id,
      event_type: decision.outcome === 'success' ? 'step_completed' : 'step_failed',
      journey_type: decision.journey_type,
      operation_type: `${decision.journey_type}.terminal`,
      idempotency_key,
      logical_period: 'iso_date:2026-06-04',
      step_id: decision.step_id,
      step_state: decision.outcome === 'success' ? 'done' : 'failed',
      payload: { terminal: true, outcome: decision.outcome },
      gate_type: null,
    }
    const result = await append(this.storage, eventInput)
    return {
      event_id: result.event.event_id,
      event_type: result.event.event_type,
      sequence: result.event.sequence,
    }
  }

  private async appendJudgmentEvent(
    decision: Extract<Decision, { kind: 'needs_judgment' }>,
    trigger: PersistedEvent,
  ): Promise<{ event_id: string; event_type: EventType; sequence: number }> {
    void trigger
    const eventInput: EventAppendInput = {
      tenant_id: decision.tenant_id,
      client_id: decision.client_id,
      stream_id: decision.stream_id,
      correlation_id: decision.correlation_id,
      causation_id: decision.caused_by_event_id,
      event_type: 'needs_judgment',
      journey_type: decision.journey_type ?? 'PRODUCE',
      operation_type: decision.idempotency_inputs.operation_type,
      idempotency_key: decision.idempotency_key,
      logical_period: decision.idempotency_inputs.logical_period,
      step_id: decision.step_id,
      payload: { reason: decision.reason, detail: decision.detail },
      gate_type: null,
    }
    const result = await append(this.storage, eventInput)
    return {
      event_id: result.event.event_id,
      event_type: result.event.event_type,
      sequence: result.event.sequence,
    }
  }

  private async appendBudgetEvent(
    decision: Extract<Decision, { kind: 'budget_blocked' }>,
    trigger: PersistedEvent,
  ): Promise<{ event_id: string; event_type: EventType; sequence: number }> {
    void trigger
    const idempotency_key = buildIdempotencyKey({
      operation_type: `${decision.journey_type}.budget`,
      client_id: decision.client_id,
      logical_period: `${randomUUID()}::budget`,
    })
    const eventInput: EventAppendInput = {
      tenant_id: decision.tenant_id,
      client_id: decision.client_id,
      stream_id: decision.stream_id,
      correlation_id: decision.correlation_id,
      causation_id: decision.caused_by_event_id,
      event_type: 'budget_blocked',
      journey_type: decision.journey_type,
      operation_type: `${decision.journey_type}.budget`,
      idempotency_key,
      logical_period: 'iso_date:2026-06-04',
      step_id: decision.step_id,
      payload: { bucket_key: decision.budget_key, reason: decision.reason },
      gate_type: null,
    }
    const result = await append(this.storage, eventInput)
    return {
      event_id: result.event.event_id,
      event_type: result.event.event_type,
      sequence: result.event.sequence,
    }
  }
}
