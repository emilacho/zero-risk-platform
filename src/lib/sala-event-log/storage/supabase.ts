/**
 * Canon canonical · Supabase storage adapter · canon canonical real prod-like
 *
 * §148 honest · canon canonical · this adapter is canonical-SKELETON +
 * canonical-integration-ready · canon canonical-NOT exercised until §144 ·
 * (a) migration `202606021946_sala_event_log.sql` applied prod, AND
 * (b) router dispatches first event via this lib. Until then this canon
 * canonical-compiles · canon canonical-typechecks · canon canonical-vitest
 * tests use InMemoryEventLogStorage (canon canonical canon ./in-memory.ts).
 *
 * Caller (router · projector) constructs with a SupabaseClient using
 * SERVICE_ROLE_KEY (canon canonical RLS bypass · per migration §5 grants).
 * Authenticated reads canon canonical-use anon client with JWT claim
 * canon canonical-tenant_id (canon canonical RLS-scoped per policy).
 *
 * Canon canonical · maps DB error codes:
 *   - 23505 UNIQUE_VIOLATION on idempotency_key → dedup (returns existing row)
 *   - 23505 UNIQUE_VIOLATION on stream_id+sequence → throws (caller retries)
 *   - 23514 CHECK_VIOLATION on gate_type_consistent → throws (caller bug)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppendResult,
  EventAppendInput,
  EventLogStorage,
  PersistedEvent,
  ReadFilters,
} from '../types'
import { GATE_EVENT_TYPES } from '../types'

const TABLE = 'sala_event_log'

export class SupabaseEventLogStorage implements EventLogStorage {
  constructor(private readonly client: SupabaseClient) {}

  async insert(input: EventAppendInput): Promise<AppendResult> {
    // canon canonical · client-side pre-check (canon canonical-matches DB CHECK · earlier signal)
    const isGateEvent = GATE_EVENT_TYPES.includes(input.event_type)
    if (isGateEvent && !input.gate_type) {
      throw new Error(
        `sala_event_log_gate_type_consistent · gate event (${input.event_type}) requires gate_type`,
      )
    }
    if (!isGateEvent && input.gate_type) {
      throw new Error(
        `sala_event_log_gate_type_consistent · non-gate event (${input.event_type}) MUST have gate_type NULL`,
      )
    }

    // canon canonical · sequence MUST be provided by caller (router allocates
    // monotonically · canon canonical typically via SELECT max(sequence)+1
    // WHERE stream_id=X · LOCK FOR UPDATE · or canon-canonical via dedicated
    // sequence allocator). canon canonical-this adapter does NOT pick the
    // sequence (canon canonical that's router responsibility per ADR-009).
    if (typeof input.sequence !== 'number') {
      throw new Error(
        'SupabaseEventLogStorage · sequence required (router allocates per-stream)',
      )
    }

    // canon canonical · canon canon canon canon-shape the INSERT payload
    const insertPayload = {
      event_id: input.event_id,
      sequence: input.sequence,
      occurred_at: input.occurred_at,
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
    }

    const { data, error } = await this.client
      .from(TABLE)
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      // canon canonical · UNIQUE_VIOLATION codes
      if (error.code === '23505') {
        // canon canonical · which constraint? · check details
        // canon canonical canon · idempotency_key violation = dedup hit → lookup + return
        if (error.message.includes('idempotency_key')) {
          const existing = await this.findByIdempotencyKey(
            input.tenant_id,
            input.idempotency_key,
          )
          if (existing) return { event: existing, inserted: false }
          // canon canonical-edge · race · key violated but lookup failed (canon canonical-other tenant?)
          throw new Error(
            `sala_event_log · idempotency_key UNIQUE violation but no row found for tenant=${input.tenant_id}`,
          )
        }
        // canon canonical · stream_id+sequence collision · caller MUST retry with fresh seq
        throw new Error(
          `sala_event_log_stream_sequence_unique · stream_id=${input.stream_id} sequence=${input.sequence} collision · caller retry`,
        )
      }
      // canon canonical · CHECK_VIOLATION canon canon · gate_type_consistent
      if (error.code === '23514') {
        throw new Error(`sala_event_log_check_violation · ${error.message}`)
      }
      // canon canonical · other errors propagate
      throw new Error(`sala_event_log_insert_failed · ${error.code} · ${error.message}`)
    }

    if (!data) {
      throw new Error('sala_event_log_insert · canon canonical empty response · canon canonical unexpected')
    }

    return { event: data as PersistedEvent, inserted: true }
  }

  async select(filters: ReadFilters): Promise<PersistedEvent[]> {
    if (!filters.tenant_id) {
      throw new Error('select · tenant_id required (RLS canon canonical)')
    }

    let query = this.client.from(TABLE).select('*').eq('tenant_id', filters.tenant_id)

    if (filters.client_id) query = query.eq('client_id', filters.client_id)
    if (filters.stream_id) query = query.eq('stream_id', filters.stream_id)
    if (filters.correlation_id) {
      query = query.eq('correlation_id', filters.correlation_id)
    }
    if (filters.journey_type) query = query.eq('journey_type', filters.journey_type)
    if (filters.event_type) {
      const types = Array.isArray(filters.event_type) ? filters.event_type : [filters.event_type]
      query = query.in('event_type', types)
    }
    if (filters.since) query = query.gte('occurred_at', filters.since)
    if (filters.until) query = query.lt('occurred_at', filters.until)

    const order = filters.order ?? 'sequence_asc'
    if (order === 'sequence_asc') {
      query = query.order('stream_id', { ascending: true }).order('sequence', { ascending: true })
    } else if (order === 'sequence_desc') {
      query = query.order('stream_id', { ascending: true }).order('sequence', { ascending: false })
    } else {
      query = query.order('occurred_at', { ascending: false })
    }

    const limit = Math.min(Math.max(1, filters.limit ?? 100), 1000)
    query = query.limit(limit)

    const { data, error } = await query
    if (error) throw new Error(`sala_event_log_select_failed · ${error.code} · ${error.message}`)
    return (data ?? []) as PersistedEvent[]
  }

  async findByIdempotencyKey(
    tenant_id: string,
    idempotency_key: string,
  ): Promise<PersistedEvent | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('idempotency_key', idempotency_key)
      .maybeSingle()
    if (error) {
      throw new Error(`sala_event_log_lookup_failed · ${error.code} · ${error.message}`)
    }
    return (data as PersistedEvent | null) ?? null
  }
}
