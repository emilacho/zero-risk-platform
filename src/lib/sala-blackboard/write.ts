/**
 * Canon canonical · `writeArtifacts(storage, input)` · canon canon canon-blackboard write
 *
 * Canon canonical · canon canon canon-builds a canonical event with `payload.
 * artifact_writes[]` and appends to the event log. Idempotency comes from
 * the underlying event log canonical UNIQUE(idempotency_key) · canonical
 * duplicate writes (canon canon canon-same operation + client + period
 * + optional input_hash) collapse transparently.
 *
 * No mutable parallel state · canon canon canon-this just emits the event ·
 * `readBlackboard()` derives current state from the log.
 */
import {
  append,
  buildIdempotencyKey,
  type AppendResult,
  type EventAppendInput,
  type EventLogStorage,
} from '@/lib/sala-event-log'
import type { ArtifactWritePayload, WriteArtifactsInput } from './types'

export interface WriteArtifactsResult extends AppendResult {}

/**
 * Canon canonical · canon canon canon-write artifacts to the blackboard.
 *
 * Behavior canon canon canon ·
 *   - REQUIRES at least 1 artifact (throws if empty array · canon canon canon-
 *     canon canon canon-empty writes are caller bug · NO silent no-op)
 *   - rejects gate event_types (canon canon canon-gate events go through a
 *     different lifecycle · NOT through artifact writes)
 *   - builds `idempotency_key` from `{operation_type + client_id +
 *     logical_period + input_hash?}` if caller doesn't pass explicit key
 *   - appends to the event log · returns `{event, inserted}`
 *
 * Returns the same shape as `append()`. `inserted=false` signals dedup
 * (canon canon canon-caller can short-circuit downstream).
 */
export async function writeArtifacts(
  storage: EventLogStorage,
  input: WriteArtifactsInput,
): Promise<WriteArtifactsResult> {
  if (!Array.isArray(input.artifacts) || input.artifacts.length === 0) {
    throw new Error('writeArtifacts · artifacts canon canon canon-array required (canon canon canon-1+ writes)')
  }

  // canon canonical · canon canon canon-canonical-validate each artifact upfront
  for (const a of input.artifacts) {
    const k = a.key
    if (typeof k !== 'string' || k.length === 0) {
      throw new Error('writeArtifacts · canonical-artifact.key canon canon canon-must be non-empty string')
    }
    if (!('value' in (a as unknown as Record<string, unknown>))) {
      throw new Error(
        `writeArtifacts · canonical-artifact.value canon canon canon-required (key="${k}")`,
      )
    }
  }

  const event_type = input.event_type ?? 'step_completed'

  const idempotency_key =
    input.idempotency_key ??
    buildIdempotencyKey({
      operation_type: input.operation_type,
      client_id: input.client_id,
      logical_period: input.logical_period,
      input_hash: input.input_hash,
    })

  const payload: ArtifactWritePayload = {
    ...(input.extra_payload ?? {}),
    artifact_writes: input.artifacts,
  }

  // canon canonical · canon canon canon-derive step_state default for step_completed
  const step_state =
    input.step_state ?? (event_type === 'step_completed' ? 'done' : undefined)

  const eventInput: EventAppendInput = {
    tenant_id: input.tenant_id,
    client_id: input.client_id,
    stream_id: input.campaign_id, // canon canon canon-blackboard scope = stream
    correlation_id: input.correlation_id,
    causation_id: input.causation_id ?? null,
    event_type,
    journey_type: input.journey_type,
    operation_type: input.operation_type,
    idempotency_key,
    logical_period: input.logical_period,
    input_hash: input.input_hash ?? null,
    workflow_run_id: input.workflow_run_id ?? null,
    step_id: input.step_id ?? null,
    step_state: step_state ?? null,
    attempt: input.attempt ?? null,
    payload,
    agent_invocation_ref: input.agent_invocation_ref ?? null,
    gate_type: null, // canon canon canon-blackboard writes are NEVER gate events
    ...(input.occurred_at ? { occurred_at: input.occurred_at } : {}),
    ...(typeof input.sequence === 'number' ? { sequence: input.sequence } : {}),
  }

  return append(storage, eventInput)
}
