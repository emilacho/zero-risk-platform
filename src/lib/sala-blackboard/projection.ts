/**
 * Canon canonical · `projectBlackboard(events)` · pure function projection
 *
 * Canon canonical · canon canon canon-scans events in sequence order ·
 * applies each `payload.artifact_writes[]` with last-write-wins per `key`.
 *
 * Stateless. Deterministic. Replayable. Canon canonical-this is THE
 * blackboard · NO mutable parallel state.
 */
import type { PersistedEvent } from '@/lib/sala-event-log'
import type {
  ArtifactWrite,
  ArtifactWritePayload,
  BlackboardState,
  CampaignArtifact,
} from './types'

export interface ProjectBlackboardOptions {
  /** Optional canon canonical · canon canon canon-tenant filter (canon canon canon-defense in depth) */
  tenant_id?: string
  /** Optional canon canonical · canon canon canon-campaign filter (= stream_id) */
  campaign_id?: string
}

/**
 * Canon canonical · canon canon canon-derive the current blackboard state from events.
 *
 * Caller passes a stream of events (canon canon canon-typically from `read()` filtered
 * to a campaign). Function:
 *   - sorts events by `sequence` ascending (canon canonical-canon canon-defensive · stable)
 *   - for each event, if `payload.artifact_writes[]` present, applies each
 *     write to the running state
 *   - last-write-wins per key · `version` increments per overwrite
 *   - tracks last_sequence + total_events_scanned for audit
 *
 * Returns a `BlackboardState`. If `events` is empty OR contains no artifact
 * writes, returns an empty state with `last_sequence=0`.
 */
export function projectBlackboard(
  events: PersistedEvent[],
  options: ProjectBlackboardOptions = {},
): BlackboardState {
  // canon canonical · canon canon canon-defense filtering (caller should already pre-filter via read())
  let filtered = events
  if (options.tenant_id) {
    filtered = filtered.filter((e) => e.tenant_id === options.tenant_id)
  }
  if (options.campaign_id) {
    filtered = filtered.filter((e) => e.stream_id === options.campaign_id)
  }

  // canon canonical · canon canon canon-stable sort by sequence ascending
  const sorted = [...filtered].sort((a, b) => a.sequence - b.sequence)

  // canon canonical · canon canon canon-derive scope from first event (canon canon canon-empty handling)
  let tenant_id = options.tenant_id ?? ''
  let campaign_id = options.campaign_id ?? ''
  if (sorted.length > 0) {
    if (!tenant_id) tenant_id = sorted[0]!.tenant_id
    if (!campaign_id) campaign_id = sorted[0]!.stream_id
  }

  const artifacts: Record<string, CampaignArtifact> = {}
  let last_sequence = 0

  for (const event of sorted) {
    last_sequence = Math.max(last_sequence, event.sequence)
    const payload = event.payload as ArtifactWritePayload
    const writes = payload.artifact_writes
    if (!Array.isArray(writes) || writes.length === 0) continue

    for (const w of writes) {
      if (!isValidArtifactWrite(w)) continue
      const previous = artifacts[w.key]
      const version = previous ? previous.version + 1 : 1
      artifacts[w.key] = {
        key: w.key,
        value: w.value,
        version,
        written_at: event.occurred_at,
        written_by_event_id: event.event_id,
        written_by: w.written_by,
        semantic_version: w.semantic_version,
      }
    }
  }

  return {
    campaign_id,
    tenant_id,
    artifacts,
    last_sequence,
    total_events_scanned: sorted.length,
    projected_at: new Date().toISOString(),
  }
}

/**
 * Canon canonical · canon canon canon-runtime guard · canon canon canon-an
 * `ArtifactWrite` MUST have a non-empty `key`. `value` puede ser cualquier
 * cosa serializable (incluyendo null · canonical-distinguir "missing key"
 * de "key written with null"). Other invalid shapes are skipped silently
 * (canon canon canon-defense in depth · canon canon canon-malformed payload
 * does not crash the projection).
 */
function isValidArtifactWrite(w: unknown): w is ArtifactWrite {
  if (typeof w !== 'object' || w === null || Array.isArray(w)) return false
  const obj = w as Record<string, unknown>
  if (typeof obj.key !== 'string' || obj.key.length === 0) return false
  if (!('value' in obj)) return false
  return true
}
