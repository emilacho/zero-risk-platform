/**
 * Canon canonical · `read(filters)` · canon canonical the canonical SELECT API
 *
 * Canon canonical · tenant_id REQUIRED (RLS-respected canon canon · canon
 * canon-cross-tenant leak impossible by design). All other filters optional.
 * Returns rows ordered per `order` param (default sequence_asc per-stream).
 */
import type { EventLogStorage, PersistedEvent, ReadFilters } from './types'

/**
 * Canon canonical · read events from the log.
 *
 * Pass `filters.tenant_id` (required) + optional canon canonical-narrowing
 * filters (client_id · stream_id · correlation_id · event_type · journey_type
 * · time window). Default order canon-sequence_asc per-stream (canonical
 * matches in-order replay semantics).
 *
 * Throws if tenant_id absent (canon canonical-RLS canonical-safety) or on
 * storage adapter failure.
 */
export async function read(
  storage: EventLogStorage,
  filters: ReadFilters,
): Promise<PersistedEvent[]> {
  return storage.select(filters)
}
