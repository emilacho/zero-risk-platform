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
  ATTEMPT_MARKER_PREFIX,
  DISPATCH_MARKER_PREFIX,
  GIVEUP_MARKER_PREFIX,
  MAX_DISPATCH_ATTEMPTS,
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

/**
 * Canon canonical · qué clase de asiento se escribe (regla de Lenovo
 * 2026-09-07). `dispatch` es el ÚNICO que significa "se despachó" y el
 * único que puede excluir el hilo por mérito propio.
 */
export type MarkerClass = 'dispatch' | 'attempt' | 'giveup'

const PREFIJO: Record<MarkerClass, string> = {
  dispatch: DISPATCH_MARKER_PREFIX,
  attempt: ATTEMPT_MARKER_PREFIX,
  giveup: GIVEUP_MARKER_PREFIX,
}

export function buildDispatchMarkerEvent(
  input: BuildMarkerInput & { readonly marker_class?: MarkerClass; readonly attempt_no?: number },
): EventAppendInput {
  const { intake } = input
  const clase: MarkerClass = input.marker_class ?? 'dispatch'
  const attempt_no = input.attempt_no ?? 0
  const step_id = `${PREFIJO[clase]}${intake.intake_source}.${intake.intake_intent}`
  const operation_type = `${intake.journey_type}.router.${clase}.${intake.intake_source}.${intake.intake_intent}`
  const logical_period = input.logical_period ?? intake.source_event.logical_period

  const idempotency_key = buildIdempotencyKey({
    operation_type,
    client_id: intake.client_id,
    logical_period,
    // canon · el intake event_id es la entrada. Para los INTENTOS se le suma
    // el número de intento: sin eso, el 2º intento del mismo sobre chocaría
    // con la clave del 1º y el reintento quedaría deduplicado en silencio.
    input_hash: clase === 'attempt' ? `${intake.event_id}#${attempt_no}` : intake.event_id,
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
      // Regla de Lenovo 2026-09-07 · el asiento dice QUÉ pasó, sin eufemismo.
      // `despachado` es la única forma honesta de leer "salió"; los otros dos
      // dicen que NO salió, y `giveup` además deja el motivo a la vista.
      marker_class: clase,
      despachado: clase === 'dispatch',
      ...(clase !== 'dispatch' ? { attempt_no, max_attempts: MAX_DISPATCH_ATTEMPTS } : {}),
      ...(clase === 'giveup'
        ? { no_pude_despachar: true, motivo: input.detail, tope_agotado: true }
        : {}),
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
