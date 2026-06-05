/**
 * Canon canonical · pending intake selection · sala-router-consumer.
 *
 * Pure function over a list of `PersistedEvent` · returns the intake
 * events that DO NOT yet have a matching `router.dispatch.*` marker
 * for the same stream_id. Caller fetches a wider window from the log
 * (e.g. last 1000 rows) and this function picks the un-processed ones.
 *
 * §148 honest · O(N) two-pass · first builds a set of (stream_id) that
 * already have a dispatch marker · second pass filters intake events
 * by exclusion. The orchestrator then bounds the result by batch_size.
 */
import type { PersistedEvent } from '@/lib/sala-event-log'
import {
  DISPATCH_MARKER_PREFIX,
  INTAKE_STEP_PREFIX,
} from './types'

export interface PendingIntakeQueryInput {
  readonly events: ReadonlyArray<PersistedEvent>
  /** Canon canonical · max returned rows (orchestrator bounds further). */
  readonly limit?: number
}

/** Canon canonical · returns intake events whose stream has no matching
 *  marker yet. Sorted by sequence ascending (FIFO order). */
export function selectPendingIntakeEvents(
  input: PendingIntakeQueryInput,
): ReadonlyArray<PersistedEvent> {
  const dispatched_streams = new Set<string>()
  for (const e of input.events) {
    if (
      e.event_type === 'step_completed' &&
      typeof e.step_id === 'string' &&
      e.step_id.startsWith(DISPATCH_MARKER_PREFIX)
    ) {
      dispatched_streams.add(e.stream_id)
    }
  }

  const pending: PersistedEvent[] = []
  for (const e of input.events) {
    if (
      e.event_type === 'step_completed' &&
      typeof e.step_id === 'string' &&
      e.step_id.startsWith(INTAKE_STEP_PREFIX) &&
      !dispatched_streams.has(e.stream_id)
    ) {
      pending.push(e)
    }
  }

  pending.sort((a, b) => a.sequence - b.sequence)
  const limit = Math.max(1, Math.min(input.limit ?? 10, 100))
  return pending.slice(0, limit)
}
