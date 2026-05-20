/**
 * Journey Orchestrator · L1 · validators
 *
 * Pure functions · no I/O · unit testable. Validates inbound dispatch
 * payloads before any DB write or L2 invocation.
 */
import {
  JOURNEY_TYPES,
  TRIGGER_TYPES,
  type DispatchRequest,
  type JourneyType,
  type TriggerType,
} from './types'

export interface ValidationResult {
  ok: boolean
  error?: string
  data?: DispatchRequest
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate a raw inbound payload. Returns `{ok:true, data}` with normalized
 * request OR `{ok:false, error}` with a 1-line reason.
 *
 * Validation rules ·
 *   - journey must be one of JOURNEY_TYPES
 *   - trigger_type must be one of TRIGGER_TYPES
 *   - client_id required for all journeys EXCEPT ACQUIRE
 *   - client_id (if present) must be UUID-shaped
 *   - params (if present) must be a plain object
 *   - stage (if present) must be a non-empty string
 */
export function validateDispatchRequest(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'body_not_object' }
  }
  const body = raw as Record<string, unknown>

  const journey = body.journey
  if (typeof journey !== 'string' || !JOURNEY_TYPES.includes(journey as JourneyType)) {
    return {
      ok: false,
      error: `invalid_journey · must be one of ${JOURNEY_TYPES.join('|')}`,
    }
  }

  const trigger_type = body.trigger_type
  if (
    typeof trigger_type !== 'string' ||
    !TRIGGER_TYPES.includes(trigger_type as TriggerType)
  ) {
    return {
      ok: false,
      error: `invalid_trigger_type · must be one of ${TRIGGER_TYPES.join('|')}`,
    }
  }

  const client_id_raw = body.client_id
  let client_id: string | null = null
  if (client_id_raw != null) {
    if (typeof client_id_raw !== 'string' || !UUID_RE.test(client_id_raw)) {
      return { ok: false, error: 'invalid_client_id · must be UUID-shaped' }
    }
    client_id = client_id_raw
  }

  if (journey !== 'ACQUIRE' && !client_id) {
    return { ok: false, error: 'client_id_required · only ACQUIRE may omit' }
  }

  const params =
    body.params && typeof body.params === 'object' && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {}

  const stage_raw = body.stage
  let stage: string | null = null
  if (stage_raw != null) {
    if (typeof stage_raw !== 'string' || stage_raw.trim().length === 0) {
      return { ok: false, error: 'invalid_stage · must be non-empty string' }
    }
    stage = stage_raw.trim()
  }

  const parent_journey_id_raw = body.parent_journey_id
  let parent_journey_id: string | null = null
  if (parent_journey_id_raw != null) {
    if (typeof parent_journey_id_raw !== 'string' || !UUID_RE.test(parent_journey_id_raw)) {
      return {
        ok: false,
        error: 'invalid_parent_journey_id · must be UUID-shaped',
      }
    }
    parent_journey_id = parent_journey_id_raw
  }

  const trigger_source =
    typeof body.trigger_source === 'string' && body.trigger_source.trim().length > 0
      ? body.trigger_source.trim().slice(0, 128)
      : undefined

  return {
    ok: true,
    data: {
      client_id,
      journey: journey as JourneyType,
      trigger_type: trigger_type as TriggerType,
      stage,
      params,
      parent_journey_id,
      trigger_source,
    },
  }
}
