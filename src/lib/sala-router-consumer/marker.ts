/**
 * Canon canonical · dispatch marker event · sala-router-consumer.
 *
 * Marker event = idempotency anchor for the consumer · once written,
 * subsequent ticks SELECT excludes the stream (see query.ts).
 *
 * Marker shape canon ·
 *   event_type · step_completed
 *   step_id    · `router.dispatch.{intake_source}.{intake_intent}`
 *   payload    · {
 *     source: 'sala-router-consumer',
 *     dispatch_kind: 'dispatched_ok' | 'dispatched_failed' | etc,
 *     dispatch_detail: string,
 *     workflow_dispatch_result?: {...},
 *     caused_by_intake_event_id: <intake event_id>,
 *   }
 *
 * §148 honest · pure function · cero IO · caller appends.
 */
import {
  buildIdempotencyKey,
  type EventAppendInput,
} from '@/lib/sala-event-log'
import {
  DISPATCH_MARKER_PREFIX,
  type DispatchOutcomeKind,
  type ParsedIntakeEvent,
} from './types'

export interface BuildMarkerInput {
  readonly intake: ParsedIntakeEvent
  readonly kind: DispatchOutcomeKind
  readonly detail: string
  readonly dispatch_result?: Record<string, unknown>
  /**
   * Canon canonical · cap §150 evaluation outcome (SPEC lazo agentico
   * 2026-06-05) · stamped into the marker payload when present so
   * forensics + dashboards see the verdict + spend snapshot · auditable
   * per-dispatch without re-querying.
   */
  readonly cap_evaluation?: Record<string, unknown>
  /** Optional · override logical_period for tests · default mirrors
   *  the intake event's. */
  readonly logical_period?: string
}

export function buildDispatchMarkerEvent(input: BuildMarkerInput): EventAppendInput {
  const { intake } = input
  const step_id = `${DISPATCH_MARKER_PREFIX}${intake.intake_source}.${intake.intake_intent}`
  const operation_type = `${intake.journey_type}.router.dispatch.${intake.intake_source}.${intake.intake_intent}`
  const logical_period = input.logical_period ?? intake.source_event.logical_period

  const idempotency_key = buildIdempotencyKey({
    operation_type,
    client_id: intake.client_id,
    logical_period,
    input_hash: intake.event_id, // canon · the intake event_id is the input
  })

  return {
    tenant_id: intake.tenant_id,
    client_id: intake.client_id,
    stream_id: intake.stream_id,
    correlation_id: intake.correlation_id,
    causation_id: intake.event_id,
    event_type: 'step_completed',
    journey_type: intake.journey_type,
    operation_type,
    idempotency_key,
    logical_period,
    step_id,
    step_state: 'done',
    payload: {
      source: 'sala-router-consumer',
      dispatch_kind: input.kind,
      dispatch_detail: input.detail,
      caused_by_intake_event_id: intake.event_id,
      intake_source: intake.intake_source,
      intake_intent: intake.intake_intent,
      worker_workflow_id: intake.worker_workflow_id,
      ...(input.dispatch_result ? { workflow_dispatch_result: input.dispatch_result } : {}),
      ...(input.cap_evaluation ? { cap_evaluation: input.cap_evaluation } : {}),
    },
    gate_type: null,
  }
}
