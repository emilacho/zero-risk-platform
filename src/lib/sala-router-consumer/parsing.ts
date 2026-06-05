/**
 * Canon canonical · parse intake events · sala-router-consumer.
 *
 * Pure function · validates the EVENT SHAPE CONTRACT that the ingress
 * orchestrator (PR #176) writes. If the shape drifts on either side
 * the contract test breaks · canon §148 single source of truth.
 *
 * Input shape (from PR #176 orchestrator.ts step 7) ·
 *   event.step_id        = `intake.{source}.{intent}`
 *   event.journey_type   = the routed journey type (e.g. 'ONBOARD')
 *   event.payload        = {
 *     source: 'sala-ingress',         (origin marker)
 *     intake_source,                  (raw source key)
 *     intake_intent,                  (raw intent verb)
 *     intake_tier,                    (A/B/C)
 *     intake_auth_method,
 *     worker_workflow_id,             (resolved at intake time)
 *     envelope_payload,               (opaque user payload)
 *   }
 */
import type { PersistedEvent } from '@/lib/sala-event-log'
import type { JourneyType } from '@/lib/sala/libretos'
import {
  INTAKE_STEP_PREFIX,
  type ParsedIntakeEvent,
  type ParseResult,
} from './types'

const KNOWN_JOURNEYS: ReadonlyArray<JourneyType> = [
  'ONBOARD',
  'PRODUCE',
  'ALWAYS_ON',
  'REVIEW',
  'ACQUIRE',
  'GROWTH',
]

function isNonEmptyString(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0
}

/**
 * Canon canonical · check if a persisted event is an intake event the
 * consumer should process · based on step_id prefix.
 */
export function isIntakeEvent(event: PersistedEvent): boolean {
  return (
    event.event_type === 'step_completed' &&
    typeof event.step_id === 'string' &&
    event.step_id.startsWith(INTAKE_STEP_PREFIX)
  )
}

/**
 * Canon canonical · parse intake event into the typed shape the
 * consumer uses · pure function · cero IO.
 */
export function parseIntakeEvent(
  event: PersistedEvent,
): ParseResult<ParsedIntakeEvent> {
  if (!isIntakeEvent(event)) {
    return {
      ok: false,
      reason: `step_id "${event.step_id ?? ''}" does not match intake prefix · expected "${INTAKE_STEP_PREFIX}*"`,
    }
  }
  if (!isNonEmptyString(event.stream_id)) {
    return { ok: false, reason: 'stream_id required' }
  }
  if (!isNonEmptyString(event.correlation_id)) {
    return { ok: false, reason: 'correlation_id required' }
  }
  if (!isNonEmptyString(event.tenant_id)) {
    return { ok: false, reason: 'tenant_id required' }
  }
  if (!isNonEmptyString(event.client_id)) {
    return { ok: false, reason: 'client_id required' }
  }
  if (!KNOWN_JOURNEYS.includes(event.journey_type as JourneyType)) {
    return {
      ok: false,
      reason: `journey_type "${event.journey_type}" not in canonical set [${KNOWN_JOURNEYS.join(', ')}]`,
    }
  }

  const payload = event.payload ?? {}
  const intake_source = (payload as Record<string, unknown>).intake_source
  const intake_intent = (payload as Record<string, unknown>).intake_intent
  const worker_workflow_id = (payload as Record<string, unknown>).worker_workflow_id

  if (!isNonEmptyString(intake_source)) {
    return { ok: false, reason: 'payload.intake_source required' }
  }
  if (!isNonEmptyString(intake_intent)) {
    return { ok: false, reason: 'payload.intake_intent required' }
  }
  if (!isNonEmptyString(worker_workflow_id)) {
    return {
      ok: false,
      reason: 'payload.worker_workflow_id required (intake must embed at ingress time)',
    }
  }

  return {
    ok: true,
    value: {
      event_id: event.event_id,
      stream_id: event.stream_id,
      correlation_id: event.correlation_id,
      tenant_id: event.tenant_id,
      client_id: event.client_id,
      journey_type: event.journey_type as JourneyType,
      intake_source,
      intake_intent,
      worker_workflow_id,
      source_event: event,
    },
  }
}
