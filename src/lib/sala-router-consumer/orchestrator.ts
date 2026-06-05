/**
 * Canon canonical · consumer tick orchestrator · sala-router-consumer.
 *
 * One tick =
 *   1. SELECT recent events from sala_event_log (tenant-scoped)
 *   2. Filter to pending intake events (no marker yet) · cap by batch_size
 *   3. For each · parse → dispatch → write marker
 *   4. Return per-event outcomes + tick summary
 *
 * §148 honest · cero infinite loop · cero implicit cron · the
 * orchestrator runs ONE tick when called. Callers (endpoint · future
 * Inngest cron · admin smoke) decide cadence. Default-OFF via
 * `isConsumerEnabled()`.
 */
import { randomUUID } from 'node:crypto'
import {
  append,
  type EventLogStorage,
  type ReadFilters,
} from '@/lib/sala-event-log'
import { dispatchOneIntake } from './dispatch'
import { buildDispatchMarkerEvent } from './marker'
import { parseIntakeEvent } from './parsing'
import { selectPendingIntakeEvents } from './query'
import type {
  ConsumerTickInput,
  ConsumerTickResult,
  DispatchOutcome,
} from './types'

export interface OrchestratorInput extends ConsumerTickInput {
  readonly storage: EventLogStorage
  /** Canon canonical · max events SELECTed from the log per tick scan
   *  window · default 200 · the FILTER then keeps only un-processed
   *  intake events bounded by batch_size. */
  readonly scan_window?: number
}

/** Canon canonical · runs one tick · TOTAL · cero silent drops. */
export async function consumeIntakeTick(
  input: OrchestratorInput,
): Promise<ConsumerTickResult> {
  const tick_id = randomUUID()
  const started_at = new Date().toISOString()
  const batch_size = Math.max(1, Math.min(input.batch_size ?? 10, 100))

  // ─── 1 · SELECT recent events from the log (tenant-scoped) ───
  // Canon canonical · tenant_id IS REQUIRED per Supabase RLS. When the
  // caller omits it, return an empty tick (cero scanned · cero processed)
  // so the admin endpoint can probe behavior without erroring out.
  if (!input.tenant_id) {
    return {
      tick_id,
      started_at,
      finished_at: new Date().toISOString(),
      scanned: 0,
      processed: 0,
      outcomes: [],
    }
  }
  const scan_window = Math.max(1, Math.min(input.scan_window ?? 200, 1000))
  const filters: ReadFilters = {
    tenant_id: input.tenant_id,
    event_type: 'step_completed',
    limit: scan_window,
    order: 'sequence_desc',
  }
  const events = await input.storage.select(filters)

  // ─── 2 · filter pending intake events ───
  const pending = selectPendingIntakeEvents({
    events,
    limit: batch_size,
  })

  const outcomes: DispatchOutcome[] = []

  // ─── 3 · process each ───
  for (const event of pending) {
    const parsed = parseIntakeEvent(event)
    if (!parsed.ok) {
      outcomes.push({
        intake_event_id: event.event_id,
        stream_id: event.stream_id,
        kind: 'skipped_parse_error',
        marker_event_id: null,
        detail: `parse_error · ${parsed.reason}`,
      })
      continue
    }

    const result = await dispatchOneIntake({
      intake: parsed.value,
      enabled: input.enabled,
      n8n_base_url: input.n8n_base_url,
      fetcher: input.fetcher,
    })

    // ─── 4 · write marker event ───
    const marker_input = buildDispatchMarkerEvent({
      intake: parsed.value,
      kind: result.kind,
      detail: result.detail,
      dispatch_result: result.workflow_dispatch_result as
        | Record<string, unknown>
        | undefined,
    })
    let marker_event_id: string | null = null
    try {
      const marker_result = await append(input.storage, marker_input)
      marker_event_id = marker_result.event.event_id
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      outcomes.push({
        intake_event_id: parsed.value.event_id,
        stream_id: parsed.value.stream_id,
        kind: 'marker_write_failed',
        marker_event_id: null,
        detail: `marker_write_failed · ${detail} · dispatch was: ${result.kind}`,
        dispatch_result: result.workflow_dispatch_result,
      })
      continue
    }

    outcomes.push({
      intake_event_id: parsed.value.event_id,
      stream_id: parsed.value.stream_id,
      kind: result.kind,
      marker_event_id,
      detail: result.detail,
      dispatch_result: result.workflow_dispatch_result,
    })
  }

  return {
    tick_id,
    started_at,
    finished_at: new Date().toISOString(),
    scanned: events.length,
    processed: outcomes.length,
    outcomes,
  }
}
