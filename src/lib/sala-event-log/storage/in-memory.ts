/**
 * Canon canonical · in-memory storage adapter · canon canonical fake for tests
 *
 * Mimics canon canonical-DB semantics canon canonical canon canon canon ·
 *   - UNIQUE(idempotency_key) canon canonical · INSERT returns existing row
 *   - UNIQUE(stream_id, sequence) canon canonical · INSERT throws on collision
 *   - CHECK gate_type consistency canon canonical · INSERT throws on violation
 *   - Monotonic sequence per stream canon canonical · auto-allocated when omitted
 *   - tenant_id RLS filter canon canonical · select() NEVER returns rows from
 *     other tenants (canonical-enforced at adapter level · canon canonical-
 *     same guarantee as DB-RLS policy)
 *
 * Canon canonical · this adapter is the canonical test substrate · all
 * library tests (idempotency · monotonic sequence · tenant scoping · gate
 * consistency · projection roundtrip) canon canonical-run against this
 * adapter. The real Supabase adapter (canon canonical `./supabase.ts`)
 * canon canonical canon-exercised post §144 migration apply.
 */
import { randomUUID } from 'node:crypto'
import type {
  AppendResult,
  EventAppendInput,
  EventLogStorage,
  PersistedEvent,
  ReadFilters,
} from '../types'
import { GATE_EVENT_TYPES } from '../types'

export class InMemoryEventLogStorage implements EventLogStorage {
  private rows: PersistedEvent[] = []
  private streamSequence = new Map<string, number>()

  /** Canon canonical helper · test-only · clear all rows + sequence state */
  reset(): void {
    this.rows = []
    this.streamSequence.clear()
  }

  /** Canon canonical helper · test-only · count rows */
  get size(): number {
    return this.rows.length
  }

  async insert(input: EventAppendInput): Promise<AppendResult> {
    // ─── canon canonical · gate_type consistency check (mirrors DB CHECK)
    const isGateEvent = GATE_EVENT_TYPES.includes(input.event_type)
    if (isGateEvent && (input.gate_type === null || input.gate_type === undefined)) {
      throw new Error(
        `sala_event_log_gate_type_consistent · gate event (${input.event_type}) requires gate_type`,
      )
    }
    if (!isGateEvent && input.gate_type !== null && input.gate_type !== undefined) {
      throw new Error(
        `sala_event_log_gate_type_consistent · non-gate event (${input.event_type}) MUST have gate_type NULL`,
      )
    }

    // ─── canon canonical · UNIQUE(idempotency_key) dedup check
    const existing = this.rows.find(
      (r) => r.tenant_id === input.tenant_id && r.idempotency_key === input.idempotency_key,
    )
    if (existing) {
      return { event: existing, inserted: false }
    }

    // ─── canon canonical · allocate monotonic sequence per stream (if omitted)
    const nextSeqForStream = (this.streamSequence.get(input.stream_id) ?? 0) + 1
    const sequence = typeof input.sequence === 'number' ? input.sequence : nextSeqForStream

    // ─── canon canonical · UNIQUE(stream_id, sequence) check (mirrors DB)
    const seqCollision = this.rows.find(
      (r) => r.stream_id === input.stream_id && r.sequence === sequence,
    )
    if (seqCollision) {
      throw new Error(
        `sala_event_log_stream_sequence_unique · stream_id=${input.stream_id} sequence=${sequence} already exists`,
      )
    }

    // ─── canon canonical · persist
    const now = new Date().toISOString()
    const row: PersistedEvent = {
      event_id: input.event_id ?? randomUUID(),
      sequence,
      occurred_at: input.occurred_at ?? now,
      tenant_id: input.tenant_id,
      client_id: input.client_id,
      stream_id: input.stream_id,
      correlation_id: input.correlation_id,
      causation_id: input.causation_id ?? null,
      event_type: input.event_type,
      journey_type: input.journey_type,
      operation_type: input.operation_type,
      idempotency_key: input.idempotency_key,
      logical_period: input.logical_period,
      input_hash: input.input_hash ?? null,
      workflow_run_id: input.workflow_run_id ?? null,
      step_id: input.step_id ?? null,
      step_state: input.step_state ?? null,
      attempt: input.attempt ?? null,
      payload: input.payload ?? {},
      provenance_tag: input.provenance_tag ?? null,
      agent_invocation_ref: input.agent_invocation_ref ?? null,
      gate_type: input.gate_type ?? null,
      created_at: now,
    }
    this.rows.push(row)
    this.streamSequence.set(input.stream_id, sequence)

    return { event: row, inserted: true }
  }

  async select(filters: ReadFilters): Promise<PersistedEvent[]> {
    if (!filters.tenant_id) {
      // canon canonical · canon canonical-RLS-respected · NEVER allow tenant-less reads
      throw new Error('select · tenant_id is required (RLS canon canonical)')
    }

    let result = this.rows.filter((r) => r.tenant_id === filters.tenant_id)

    if (filters.client_id) result = result.filter((r) => r.client_id === filters.client_id)
    if (filters.stream_id) result = result.filter((r) => r.stream_id === filters.stream_id)
    if (filters.correlation_id) {
      result = result.filter((r) => r.correlation_id === filters.correlation_id)
    }
    if (filters.journey_type) {
      result = result.filter((r) => r.journey_type === filters.journey_type)
    }
    if (filters.event_type) {
      const allowed = Array.isArray(filters.event_type)
        ? filters.event_type
        : [filters.event_type]
      result = result.filter((r) => allowed.includes(r.event_type))
    }
    if (filters.since) {
      const since = filters.since
      result = result.filter((r) => r.occurred_at >= since)
    }
    if (filters.until) {
      const until = filters.until
      result = result.filter((r) => r.occurred_at < until)
    }

    // canon canonical · ordering
    const order = filters.order ?? 'sequence_asc'
    if (order === 'sequence_asc') {
      result = [...result].sort((a, b) => {
        if (a.stream_id !== b.stream_id) return a.stream_id.localeCompare(b.stream_id)
        return a.sequence - b.sequence
      })
    } else if (order === 'sequence_desc') {
      result = [...result].sort((a, b) => {
        if (a.stream_id !== b.stream_id) return a.stream_id.localeCompare(b.stream_id)
        return b.sequence - a.sequence
      })
    } else {
      result = [...result].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    }

    // canon canonical · limit
    const limit = Math.min(Math.max(1, filters.limit ?? 100), 1000)
    return result.slice(0, limit)
  }

  async findByIdempotencyKey(
    tenant_id: string,
    idempotency_key: string,
  ): Promise<PersistedEvent | null> {
    const found = this.rows.find(
      (r) => r.tenant_id === tenant_id && r.idempotency_key === idempotency_key,
    )
    return found ?? null
  }
}
