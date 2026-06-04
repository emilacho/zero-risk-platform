/**
 * Canon canonical · Supabase storage adapter · REAL persistence
 *
 * Sprint 12 Fase 0 Ronda 3 Track J · CC#1 · spec `SALA-FASE0-ronda3-router.md` §7.
 *
 * §148 honest · canon canonical · this adapter is canonical-COMPLETE +
 * canonical-integration-ready · canon canonical-NOT exercised against real DB
 * until §144:
 *   (a) migration `202606021946_sala_event_log.sql` (PR #141) applied prod, AND
 *   (b) router/projector dispatches first event via this lib.
 *
 * Until then this canon canonical-compiles · canon canonical-typechecks ·
 * vitest tests use a canonical FakeSupabaseClient (see test file) and the
 * InMemoryEventLogStorage canon canonical-mirrors the contract for cross-
 * implementation parity.
 *
 * ## Concurrency model canon canonical
 *
 * Caller (router · projector) constructs with a SupabaseClient using
 * `SUPABASE_SERVICE_ROLE_KEY` (canon canonical RLS bypass · per migration §5
 * grants). Authenticated reads canon canonical-use anon client with JWT
 * claim `tenant_id` (canon canonical RLS-scoped per policy).
 *
 * ### Idempotency dedup (DB-level)
 * - Enforced by `UNIQUE(idempotency_key)` constraint on the table.
 * - canon canonical · `insert()` first does a FAST-PATH pre-check via
 *   `findByIdempotencyKey()` to short-circuit known duplicates without
 *   even attempting the INSERT (avoids wasting sequence allocations).
 * - canon canonical · the INSERT is still wrapped in DB-level UNIQUE so
 *   race conditions between pre-check and INSERT are caught as `23505`
 *   and converted to dedup-return.
 *
 * ### Sequence allocation (per-stream monotonic)
 * - Per ADR-009 + spec §7, sequence is monotonic per `stream_id`.
 * - canon canonical · adapter AUTO-ALLOCATES via `SELECT MAX(sequence)+1
 *   FROM sala_event_log WHERE stream_id = $1` when caller omits `sequence`.
 * - canon canonical · UNIQUE(stream_id, sequence) constraint catches races.
 * - canon canonical · on `23505` collision the adapter RETRIES with a
 *   freshly-allocated sequence · canon-bounded by `maxSequenceRetries`
 *   (default 5).
 * - canon canonical · caller can OVERRIDE by passing explicit `sequence`
 *   (canon canonical-replay/import scenario) · in that case NO retry
 *   (the collision is treated as caller bug · propagated).
 *
 * **§148 honest caveat** · this pattern is "optimistic concurrency" · NOT a
 * pessimistic lock. Under canon-high contention (canon-many concurrent
 * writers to the same stream) retries may exhaust. canon canon-canonical-the
 * Sprint 13+ optimization is to ship a SECURITY DEFINER function
 * `sala_event_log_allocate_sequence(stream_id)` that wraps
 * `SELECT ... FOR UPDATE`/`pg_advisory_xact_lock` and is called via RPC.
 * Per Track J guardrails canon-NO schema extension allowed, so this canon-
 * patch ships the optimistic pattern + canon-documented escape hatch.
 *
 * ### RLS
 * - Migration §5 enables RLS · service_role grants explicit INSERT/SELECT.
 * - Adapter NEVER attempts to bypass RLS · canon canonical-relies on caller
 *   constructing the client with the right key.
 *
 * ### Error mapping (PG error codes)
 * - `23505` UNIQUE_VIOLATION on `idempotency_key` → dedup (returns existing row)
 * - `23505` UNIQUE_VIOLATION on `stream_id, sequence` → retry (auto-alloc) OR throw (explicit)
 * - `23514` CHECK_VIOLATION on `gate_type_consistent` → throws (caller bug)
 * - other errors → propagate
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
const PG_UNIQUE_VIOLATION = '23505'
const PG_CHECK_VIOLATION = '23514'
const DEFAULT_MAX_SEQUENCE_RETRIES = 5

export interface SupabaseEventLogStorageOptions {
  /**
   * Canon canonical · max retries when AUTO-allocating sequence and
   * UNIQUE(stream_id, sequence) collides. Default 5. Set to 1 to disable
   * retry. Caller-provided explicit sequence NEVER retries (treated as
   * caller bug · canonical-replay/import scenario).
   */
  maxSequenceRetries?: number
}

export class SupabaseEventLogStorage implements EventLogStorage {
  private readonly maxSequenceRetries: number

  constructor(
    private readonly client: SupabaseClient,
    options: SupabaseEventLogStorageOptions = {},
  ) {
    const r = options.maxSequenceRetries ?? DEFAULT_MAX_SEQUENCE_RETRIES
    if (!Number.isFinite(r) || r < 1) {
      throw new Error(
        `SupabaseEventLogStorage · maxSequenceRetries must be >= 1 (got ${r})`,
      )
    }
    this.maxSequenceRetries = Math.floor(r)
  }

  async insert(input: EventAppendInput): Promise<AppendResult> {
    // ─── 1 · canon canonical · client-side CHECK mirror (gate_type)
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

    // ─── 2 · canon canonical · FAST-PATH dedup pre-check
    // Avoids wasting a sequence allocation when the row already exists.
    const preExisting = await this.findByIdempotencyKey(
      input.tenant_id,
      input.idempotency_key,
    )
    if (preExisting) {
      return { event: preExisting, inserted: false }
    }

    // ─── 3 · canon canonical · sequence allocation + insert with retry
    const callerProvidedSequence = typeof input.sequence === 'number'
    let attempt = 0
    let lastError: unknown = null

    while (attempt < this.maxSequenceRetries) {
      attempt++
      const sequence = callerProvidedSequence
        ? (input.sequence as number)
        : await this.allocateNextSequence(input.stream_id)

      const insertPayload = this.buildInsertPayload(input, sequence)

      const { data, error } = await this.client
        .from(TABLE)
        .insert(insertPayload)
        .select()
        .single()

      if (!error && data) {
        return { event: data as PersistedEvent, inserted: true }
      }

      // canon canonical · classify error
      if (error?.code === PG_UNIQUE_VIOLATION) {
        if (this.isIdempotencyKeyViolation(error.message)) {
          // canon · race between pre-check and INSERT · resolve to dedup
          const existing = await this.findByIdempotencyKey(
            input.tenant_id,
            input.idempotency_key,
          )
          if (existing) return { event: existing, inserted: false }
          // canon · edge · key violation but lookup failed
          throw new Error(
            `sala_event_log · idempotency_key UNIQUE violation but no row found for tenant=${input.tenant_id} key=${input.idempotency_key}`,
          )
        }
        if (this.isStreamSequenceViolation(error.message)) {
          if (callerProvidedSequence) {
            // canon · caller asked for a specific sequence that collided · propagate
            throw new Error(
              `sala_event_log_stream_sequence_unique · stream_id=${input.stream_id} sequence=${sequence} collision · caller-provided sequence (no retry)`,
            )
          }
          // canon · auto-alloc collision · retry
          lastError = error
          continue
        }
        // canon · other unique violation (canonical-shouldn't happen with this schema)
        throw new Error(`sala_event_log_insert_failed · 23505 · ${error.message}`)
      }
      if (error?.code === PG_CHECK_VIOLATION) {
        throw new Error(`sala_event_log_check_violation · ${error.message}`)
      }
      if (error) {
        throw new Error(
          `sala_event_log_insert_failed · ${error.code ?? '?'} · ${error.message ?? '?'}`,
        )
      }
      throw new Error(
        'sala_event_log_insert · canonical-empty response · canon canonical-unexpected',
      )
    }

    // canon · canonical-retries exhausted
    throw new Error(
      `sala_event_log · max sequence allocation retries (${this.maxSequenceRetries}) exceeded for stream_id=${input.stream_id} · last_error=${
        lastError instanceof Error ? lastError.message : 'unknown'
      }`,
    )
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
      query = query
        .order('stream_id', { ascending: true })
        .order('sequence', { ascending: true })
    } else if (order === 'sequence_desc') {
      query = query
        .order('stream_id', { ascending: true })
        .order('sequence', { ascending: false })
    } else {
      query = query.order('occurred_at', { ascending: false })
    }

    const limit = Math.min(Math.max(1, filters.limit ?? 100), 1000)
    query = query.limit(limit)

    const { data, error } = await query
    if (error) {
      throw new Error(`sala_event_log_select_failed · ${error.code ?? '?'} · ${error.message ?? '?'}`)
    }
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
      throw new Error(`sala_event_log_lookup_failed · ${error.code ?? '?'} · ${error.message ?? '?'}`)
    }
    return (data as PersistedEvent | null) ?? null
  }

  // ─────────────────────────────────────────────────────────────────────
  // canon canonical · privates
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Canon canonical · SELECT MAX(sequence) + 1 for the stream.
   *
   * §148 honest · canon canonical-NOT atomic. Race between SELECT and
   * subsequent INSERT is RESOLVED by the UNIQUE(stream_id, sequence)
   * constraint + the outer retry loop in `insert()`.
   */
  private async allocateNextSequence(stream_id: string): Promise<number> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('sequence')
      .eq('stream_id', stream_id)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      throw new Error(
        `sala_event_log_allocate_sequence_failed · ${error.code ?? '?'} · ${error.message ?? '?'}`,
      )
    }
    const max = (data as { sequence?: number } | null)?.sequence ?? 0
    return max + 1
  }

  private buildInsertPayload(input: EventAppendInput, sequence: number) {
    return {
      event_id: input.event_id,
      sequence,
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
  }

  private isIdempotencyKeyViolation(message: string): boolean {
    return /idempotency_key/i.test(message)
  }

  private isStreamSequenceViolation(message: string): boolean {
    return (
      /stream_sequence_unique/i.test(message) ||
      (/stream_id/i.test(message) && /sequence/i.test(message))
    )
  }
}
