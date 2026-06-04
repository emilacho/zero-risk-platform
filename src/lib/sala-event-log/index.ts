/**
 * Public surface · `src/lib/sala-event-log/`
 *
 * ADR-009 event-log library · Sprint 12 Fase 0 Track A · CC#1.
 *
 * Schema source canon canonical · `supabase/migrations/202606021946_sala_event_log.sql`
 * (PR #141 · CERRADO 2026-06-02 · NO applied yet · §144 gated).
 */

export {
  EVENT_TYPES,
  STEP_STATES,
  GATE_TYPES,
  GATE_EVENT_TYPES,
} from './types'

export type {
  EventType,
  StepState,
  GateType,
  ProvenanceTag,
  EventAppendInput,
  PersistedEvent,
  AppendResult,
  ReadFilters,
  EventLogStorage,
} from './types'

export {
  buildIdempotencyKey,
  hashInputContent,
} from './idempotency'

export type { IdempotencyKeyInput } from './idempotency'

export { append } from './append'
export { read } from './read'

export { InMemoryEventLogStorage } from './storage/in-memory'
export { SupabaseEventLogStorage } from './storage/supabase'

export { dispatchFunnel } from './projections/dispatch-funnel'
export type { DispatchFunnelBucket } from './projections/dispatch-funnel'
