/**
 * Canon canonical · `readJourneyState(storage, input)` · canon canon-read + project
 *
 * Canon canonical · canon canon-canon-reads events for a stream from event-log ·
 * projects to current journey state via `projectJourneyState()`.
 *
 * Tenant + stream scope canonical-REQUIRED · canon canon-canon-defense in depth ·
 * canon canon-canon-RLS-respected.
 */
import { read, type EventLogStorage } from '@/lib/sala-event-log'
import { projectJourneyState } from './projection'
import type { JourneyState, ReadJourneyStateInput } from './types'

const DEFAULT_MAX_EVENTS = 1000

/**
 * Canon canonical · canon canon-canon-read the current journey state.
 *
 * Behavior canon canon canon ·
 *   - REQUIRES `tenant_id` + `stream_id`
 *   - reads events for the stream ordered by sequence_asc · canon canon-canon-up to `max_events`
 *   - applies optional `since` / `until` time window
 *   - projects state via `projectJourneyState()`
 *
 * Returns canonical `JourneyState`. If no events found · returns idle state
 * with the requested scope set.
 */
export async function readJourneyState(
  storage: EventLogStorage,
  input: ReadJourneyStateInput,
): Promise<JourneyState> {
  if (!input.tenant_id) {
    throw new Error('readJourneyState · tenant_id canon canon-canon-required (RLS)')
  }
  if (!input.stream_id) {
    throw new Error('readJourneyState · stream_id canon canon-canon-required')
  }

  const max = Math.min(Math.max(1, input.max_events ?? DEFAULT_MAX_EVENTS), 1000)

  const events = await read(storage, {
    tenant_id: input.tenant_id,
    stream_id: input.stream_id,
    since: input.since,
    until: input.until,
    order: 'sequence_asc',
    limit: max,
  })

  return projectJourneyState(events, {
    tenant_id: input.tenant_id,
    stream_id: input.stream_id,
  })
}
