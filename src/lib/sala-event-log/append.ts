/**
 * Canon canonical · `append(event)` · canon canonical the only write API
 *
 * Canon canonical · enforces:
 *   - idempotency dedup via business-key (UNIQUE idempotency_key)
 *   - gate_type consistency (delegated to storage adapter mirror DB CHECK)
 *   - monotonic sequence per stream (delegated to storage adapter)
 *
 * Caller passes the canonical event input. Library wires the storage
 * adapter call. On dedup hit · returns `inserted: false` + pre-existing
 * row (canon canonical canon canon canonical-natural rollup of duplicate
 * triggers · the daemon-$19 case canon canonical-collapses transparently).
 */
import type { AppendResult, EventAppendInput, EventLogStorage } from './types'

/**
 * Canon canonical · append a single event to the log.
 *
 * Returns the persisted row + `inserted` boolean. `inserted=false` signals
 * the dedup path (canon canonical canon idempotency_key collision · canon
 * canon canon-already-recorded · NOT an error).
 *
 * Throws on:
 *   - gate_type consistency violation (caller bug · fix at source)
 *   - stream_id+sequence collision when caller passed explicit sequence
 *     (canon canonical canon canon-router retry with fresh sequence)
 *   - storage adapter failure (DB down · auth · etc · propagate)
 */
export async function append(
  storage: EventLogStorage,
  event: EventAppendInput,
): Promise<AppendResult> {
  return storage.insert(event)
}
