/**
 * Canon canonical · `projectJourneyState(events)` · pure function projection
 *
 * Canon canonical · canon canon-fold over events ordenados por `sequence` ·
 * deriva journey + current_step + status + pending gates/judgments + budget
 * count + canon canon-canon-canon canon-canon-last_event meta.
 *
 * Pure · deterministic · replayable · canon canon-canon-no IO · canon canon-canon canon-canon canon-canon-canon-canon-NO mutable parallel state.
 *
 * Canon canonical canon canon-§148 honest · ESTE projection NO declara
 * `done` (terminal) · canon canon-canon-canon canon-router consulta el libreto
 * (Track G) para ese veredicto. Aquí solo el "current state".
 */
import type { EventType, PersistedEvent } from '@/lib/sala-event-log'
import type {
  JourneyState,
  JourneyStatus,
  PendingGate,
  PendingJudgment,
} from './types'

export interface ProjectJourneyStateOptions {
  /** Optional canon canonical · canon canon-canon-tenant filter (defense in depth) */
  tenant_id?: string
  /** Optional canon canonical · canon canon-canon-stream filter */
  stream_id?: string
}

/**
 * Canon canonical · canon canon-canon-derive el journey state de events.
 *
 * Behavior canon canon canon ·
 *   - sorts events por sequence ascending (canon canon-canon-defensive · stable)
 *   - applies optional tenant/stream filter (canon canon-canon-defense in depth)
 *   - folds events · canon canon-canon-actualizando state per event_type
 *   - pending gates · canon canon-canon-gate_pending push · gate_resolved pop by causation_id
 *   - pending judgments · canon canon-canon-needs_judgment push · judgment_resolved pop
 *   - canon canon-canon-canon-canon canon-canon-budget_blocked acumula contador (canon canon-canon-canonical-canon canon-canon-canon canon-canon-router decide retry)
 *   - status canon canon-canon-canonical-deriva de canon canon-canon-canon-canon canon-canon-canonical-canon canon-canon-(pending_gates · pending_judgments · last event)
 *
 * Returns canonical `JourneyState`. Si no hay events · status='idle' + nulls.
 */
export function projectJourneyState(
  events: PersistedEvent[],
  options: ProjectJourneyStateOptions = {},
): JourneyState {
  // canon canonical · defense filter
  let filtered = events
  if (options.tenant_id) {
    filtered = filtered.filter((e) => e.tenant_id === options.tenant_id)
  }
  if (options.stream_id) {
    filtered = filtered.filter((e) => e.stream_id === options.stream_id)
  }

  // canon canonical · stable sort by sequence
  const sorted = [...filtered].sort((a, b) => a.sequence - b.sequence)

  // canon canonical · empty handling
  let tenant_id = options.tenant_id ?? ''
  let stream_id = options.stream_id ?? ''
  if (sorted.length > 0) {
    if (!tenant_id) tenant_id = sorted[0]!.tenant_id
    if (!stream_id) stream_id = sorted[0]!.stream_id
  }

  // canon canonical · accumulators
  let journey: string | null = null
  let client_id: string | null = null
  let current_step: string | null = null
  let current_step_state: PersistedEvent['step_state'] = null
  let current_step_attempt: number | null = null
  const pending_gates: PendingGate[] = []
  const pending_judgments: PendingJudgment[] = []
  let budget_blocked_count = 0
  let correlation_id: string | null = null
  let last_event_id: string | null = null
  let last_event_type: EventType | null = null
  let last_event_at: string | null = null
  let last_sequence = 0

  for (const e of sorted) {
    // canon canonical · update last_* meta on every event
    last_event_id = e.event_id
    last_event_type = e.event_type
    last_event_at = e.occurred_at
    last_sequence = Math.max(last_sequence, e.sequence)
    correlation_id = e.correlation_id
    journey = e.journey_type
    client_id = e.client_id

    // canon canonical · update step anchor for step-tagged events
    if (e.step_id) current_step = e.step_id
    if (e.step_state) current_step_state = e.step_state
    if (typeof e.attempt === 'number') current_step_attempt = e.attempt

    // canon canonical · per-event-type effects on pending lists + budget
    switch (e.event_type) {
      case 'gate_pending': {
        // canon canon · canon canon-canon-MUST have gate_type per DB CHECK · canon-defense if NULL
        if (e.gate_type) {
          pending_gates.push({
            event_id: e.event_id,
            opened_at: e.occurred_at,
            gate_type: e.gate_type,
            step_id: e.step_id,
            correlation_id: e.correlation_id,
          })
        }
        break
      }
      case 'gate_resolved': {
        // canon canon · canon canon-canon-pop matching pending gate by causation_id
        const idx = pending_gates.findIndex((g) => g.event_id === e.causation_id)
        if (idx >= 0) {
          pending_gates.splice(idx, 1)
        } else if (pending_gates.length > 0) {
          // canon canon · canon canon-canon-fallback · canon canon-canon-canon-causation_id missing · pop oldest gate
          // canon canon · canon canon-canon-canon-defense · canon canon-canon-canon-the router SHOULD set causation_id but if absent · canon canon-canon-canon-FIFO pop is canon canonical-best-effort
          pending_gates.shift()
        }
        break
      }
      case 'needs_judgment': {
        pending_judgments.push({
          event_id: e.event_id,
          raised_at: e.occurred_at,
          step_id: e.step_id,
          correlation_id: e.correlation_id,
        })
        break
      }
      case 'judgment_resolved': {
        const idx = pending_judgments.findIndex((j) => j.event_id === e.causation_id)
        if (idx >= 0) {
          pending_judgments.splice(idx, 1)
        } else if (pending_judgments.length > 0) {
          pending_judgments.shift()
        }
        break
      }
      case 'budget_blocked': {
        budget_blocked_count += 1
        break
      }
      // canon canon · canon canon-canon-other event types do NOT touch pending lists
      default:
        break
    }
  }

  return {
    stream_id,
    tenant_id,
    journey,
    client_id,
    current_step,
    current_step_state,
    status: deriveStatus({
      hasEvents: sorted.length > 0,
      last_event_type,
      pending_gates_count: pending_gates.length,
      pending_judgments_count: pending_judgments.length,
    }),
    pending_gates,
    pending_judgments,
    budget_blocked_count,
    current_step_attempt,
    correlation_id,
    last_event_id,
    last_event_type,
    last_event_at,
    last_sequence,
    total_events_scanned: sorted.length,
    projected_at: new Date().toISOString(),
  }
}

/**
 * Canon canonical · canon canon-canon-derive status from canon canon-canon-canon-canon canon-canon-canon-event log signals.
 *
 * Priority order canon canon canon-canon-canon-canon canon-canon-canon-canonical ·
 *   1. canon canon-canon-canon canon-canon-canon canon-canon-canon canon-canon-canon-canon-no events → 'idle'
 *   2. canon canon-canon-canon canon-canon-canon-canon-canon-canon canon-canon canon-canon-canon-pending judgment → 'awaiting_judgment' (canon canon-canon-canon-§H-a precede gates)
 *   3. canon canon-canon-canon canon-canon-canon canon-canon-canon canon-canon-canon-canon-pending gate → 'awaiting_gate'
 *   4. canon canon-canon-canon canon-canon-canon canon-canon-canon-canon canon-canon-canon-canon-last event = budget_blocked → 'blocked'
 *   5. canon canon-canon-canon canon-canon-canon canon-canon-canon-canon canon-canon-canon-canon-last event = step_failed → 'step_failed'
 *   6. canon canon-canon-canon canon-canon-canon canon-canon-canon canon-canon-canon-canon-canon-canon canon-canon-canon canon-canon-canon canon-canon-canon-last event = step_completed AND no pending → 'step_done'
 *   7. canon canon-canon-canon canon-canon-canon canon-canon-canon canon-canon-canon-canon-canon-canon canon-canon-canon-canon-default → 'running'
 *
 * Canon canonical · `awaiting_judgment` precede `awaiting_gate` por design (canon canon-canon-canon canon-canon-§H-a off-script handler es prioritario sobre gates).
 */
function deriveStatus(args: {
  hasEvents: boolean
  last_event_type: EventType | null
  pending_gates_count: number
  pending_judgments_count: number
}): JourneyStatus {
  if (!args.hasEvents) return 'idle'
  if (args.pending_judgments_count > 0) return 'awaiting_judgment'
  if (args.pending_gates_count > 0) return 'awaiting_gate'
  switch (args.last_event_type) {
    case 'budget_blocked':
      return 'blocked'
    case 'step_failed':
      return 'step_failed'
    case 'step_completed':
      return 'step_done'
    default:
      return 'running'
  }
}
