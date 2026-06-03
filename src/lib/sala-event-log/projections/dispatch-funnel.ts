/**
 * Canon canonical · projection example · dispatch funnel read-model
 *
 * Canon canonical · the projection pattern · derive state from the event log
 * (canon canonical canon canon · the log is authoritative · projections are
 * canon canonical-non-authoritative materialized views over canon · canon
 * canon-rebuildable from canon canonical-replay).
 *
 * This canonical-example projection answers · "for each stream in tenant T
 * over time window W · how many dispatch_requested fired · how many got
 * step_started · step_completed · step_failed · canon canon canon-budget_blocked
 * canon canon canon-needs_judgment · canon canon-handoff?". Canon canonical
 * funnel-shaped read · canon canon canonical-canon canon-rate analysis.
 *
 * Canon canonical · canonical-stateless · pure function · feed it events
 * (canon canonical from `read()`) · canonical-aggregates in memory.
 */
import type { PersistedEvent } from '../types'

export interface DispatchFunnelBucket {
  stream_id: string
  client_id: string
  journey_type: string
  dispatch_requested: number
  step_started: number
  step_completed: number
  step_failed: number
  handoff: number
  gate_pending: number
  gate_resolved: number
  needs_judgment: number
  judgment_resolved: number
  budget_blocked: number
  total_events: number
  first_occurred_at: string
  last_occurred_at: string
}

/**
 * Canon canonical · group events by stream_id · count per event_type.
 *
 * Returns one bucket per stream · canon canonical canon canon-skips streams
 * canon canon-zero events (canon canonical no input · no row). Order canon
 * canonical-by first_occurred_at ascending.
 */
export function dispatchFunnel(events: PersistedEvent[]): DispatchFunnelBucket[] {
  if (events.length === 0) return []

  const byStream = new Map<string, DispatchFunnelBucket>()

  for (const e of events) {
    let bucket = byStream.get(e.stream_id)
    if (!bucket) {
      bucket = {
        stream_id: e.stream_id,
        client_id: e.client_id,
        journey_type: e.journey_type,
        dispatch_requested: 0,
        step_started: 0,
        step_completed: 0,
        step_failed: 0,
        handoff: 0,
        gate_pending: 0,
        gate_resolved: 0,
        needs_judgment: 0,
        judgment_resolved: 0,
        budget_blocked: 0,
        total_events: 0,
        first_occurred_at: e.occurred_at,
        last_occurred_at: e.occurred_at,
      }
      byStream.set(e.stream_id, bucket)
    }

    // canon canonical · canon canon canon-canonical-tally
    bucket.total_events += 1
    if (e.occurred_at < bucket.first_occurred_at) bucket.first_occurred_at = e.occurred_at
    if (e.occurred_at > bucket.last_occurred_at) bucket.last_occurred_at = e.occurred_at

    switch (e.event_type) {
      case 'dispatch_requested':
        bucket.dispatch_requested += 1
        break
      case 'step_started':
        bucket.step_started += 1
        break
      case 'step_completed':
        bucket.step_completed += 1
        break
      case 'step_failed':
        bucket.step_failed += 1
        break
      case 'handoff':
        bucket.handoff += 1
        break
      case 'gate_pending':
        bucket.gate_pending += 1
        break
      case 'gate_resolved':
        bucket.gate_resolved += 1
        break
      case 'needs_judgment':
        bucket.needs_judgment += 1
        break
      case 'judgment_resolved':
        bucket.judgment_resolved += 1
        break
      case 'budget_blocked':
        bucket.budget_blocked += 1
        break
    }
  }

  return Array.from(byStream.values()).sort((a, b) =>
    a.first_occurred_at.localeCompare(b.first_occurred_at),
  )
}
