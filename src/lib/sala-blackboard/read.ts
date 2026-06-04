/**
 * Canon canonical · `readBlackboard(storage, input)` · canon canon canon-read + project
 *
 * Canon canonical · canon canon canon-reads events for a campaign (= stream_id)
 * from the event log · projects to current artifact state via
 * `projectBlackboard()`.
 *
 * Tenant + campaign scope canonical-REQUIRED · canon canon canon-defense in
 * depth · canon canon canon-RLS-respected.
 */
import { read, type EventLogStorage } from '@/lib/sala-event-log'
import { projectBlackboard } from './projection'
import type { BlackboardState, ReadBlackboardInput } from './types'

const DEFAULT_MAX_EVENTS = 1000

/**
 * Canon canonical · canon canon canon-read the current blackboard state.
 *
 * Behavior canon canon canon ·
 *   - REQUIRES `tenant_id` + `campaign_id`
 *   - reads events for the campaign (canon canon canon-stream_id) ordered by
 *     sequence_asc · canon canon canon-up to `max_events` (default 1000)
 *   - applies optional `since` / `until` time window
 *   - projects state via `projectBlackboard()`
 *
 * Returns `BlackboardState`. If no events found · returns empty state
 * with the requested scope set (canon canon canon-canonical-no-events-yet).
 */
export async function readBlackboard(
  storage: EventLogStorage,
  input: ReadBlackboardInput,
): Promise<BlackboardState> {
  if (!input.tenant_id) {
    throw new Error('readBlackboard · tenant_id canon canon canon-required (RLS)')
  }
  if (!input.campaign_id) {
    throw new Error('readBlackboard · campaign_id canon canon canon-required')
  }

  const max = Math.min(Math.max(1, input.max_events ?? DEFAULT_MAX_EVENTS), 1000)

  const events = await read(storage, {
    tenant_id: input.tenant_id,
    stream_id: input.campaign_id,
    since: input.since,
    until: input.until,
    order: 'sequence_asc',
    limit: max,
  })

  return projectBlackboard(events, {
    tenant_id: input.tenant_id,
    campaign_id: input.campaign_id,
  })
}
