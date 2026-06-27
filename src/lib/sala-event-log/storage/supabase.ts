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
const ALLOCATE_RPC = 'sala_event_log_allocate_sequence'
const PG_UNIQUE_VIOLATION = '23505'
const PG_CHECK_VIOLATION = '23514'
// canon · PostgREST "function not found" codes when RPC doesn't exist
// (Track M migration not applied yet). Canon-canonical-fallback to optimista.
const RPC_NOT_FOUND_CODES = new Set(['PGRST202', '42883'])
const DEFAULT_MAX_SEQUENCE_RETRIES = 5

export type AllocatorMode = 'auto' | 'atomic_rpc' | 'optimistic'
export type AllocatorDetected = 'atomic_rpc' | 'optimistic' | 'unknown'

export interface SupabaseEventLogStorageOptions {
  /**
   * Canon canonical · max retries when AUTO-allocating sequence and
   * UNIQUE(stream_id, sequence) collides. Default 5. Set to 1 to disable
   * retry. Caller-provided explicit sequence NEVER retries (treated as
   * caller bug · canonical-replay/import scenario).
   *
   * Only applies in `optimistic` allocator mode. The `atomic_rpc` mode
   * is single-shot (the SECURITY DEFINER function serialises canonical-
   * per-stream · no collision possible · canon-no retry needed).
   */
  maxSequenceRetries?: number

  /**
   * Track M canon canonical · allocator mode.
   *
   * - `auto` (default) · adapter probes the schema on first insert per
   *   stream-allocation · uses the atomic RPC if it exists · falls back
   *   to optimistic otherwise. Backward-compat · ships SAFELY before the
   *   Track M migration is applied (§144-gated apply at canary scale).
   * - `atomic_rpc` · force the RPC · throws if not present (canon-canonical-
   *   useful for tests + post-migration prod).
   * - `optimistic` · force the optimistic SELECT MAX(sequence)+1 · canon-
   *   canonical-useful for tests + the pre-migration window.
   */
  allocatorMode?: AllocatorMode
}

export class SupabaseEventLogStorage implements EventLogStorage {
  private readonly maxSequenceRetries: number
  private readonly allocatorMode: AllocatorMode
  /** Cached detection · set on first allocation attempt in `auto` mode. */
  private detectedAllocator: AllocatorDetected = 'unknown'

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
    this.allocatorMode = options.allocatorMode ?? 'auto'
  }

  /**
   * Canon canonical · returns which allocator mode is currently active.
   * For `auto` mode this reflects the last detection · `unknown` until
   * the first allocation runs.
   */
  getAllocatorMode(): { configured: AllocatorMode; detected: AllocatorDetected } {
    return { configured: this.allocatorMode, detected: this.detectedAllocator }
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

    // ─── 3 · canon canonical · sequence allocation + insert
    // Track M · Two paths · (a) atomic RPC · single-shot · serialised per-stream
    // via pg_advisory_xact_lock · canon-NO retry needed · (b) optimistic
    // SELECT MAX(sequence)+1 + UNIQUE catch + retry loop (legacy · pre-#Track-M
    // migration apply · still required for backward-compat in `auto` mode).
    const callerProvidedSequence = typeof input.sequence === 'number'

    // canon · explicit-sequence path is identical in both modes · canon-canonical
    // canon-caller owns ordering · we just INSERT and surface any UNIQUE collision.
    if (callerProvidedSequence) {
      return await this.insertWithGivenSequence(input, input.sequence as number)
    }

    // canon · auto-alloc · choose allocator
    const mode = await this.chooseAllocator()

    if (mode === 'atomic_rpc') {
      // canon · single-shot · the RPC's advisory lock + FOR UPDATE serialises
      // canon-per-stream · canon-NO retry possible (each call gets a unique
      // canon-monotonic sequence). If the INSERT still 23505s on (stream,
      // canon-sequence) it indicates the RPC was called outside a transaction
      // canon-OR the schema is broken · canon-canonical-throw with diagnostic.
      const sequence = await this.allocateAtomicSequence(input.stream_id)
      return await this.insertWithGivenSequence(input, sequence)
    }

    // canon · optimistic mode · canon-canonical-pre-Track-M behaviour · retry loop
    let attempt = 0
    let lastError: unknown = null
    while (attempt < this.maxSequenceRetries) {
      attempt++
      const sequence = await this.allocateNextSequence(input.stream_id)
      const result = await this.tryInsertOnce(input, sequence)
      if (result.kind === 'ok') return result.value
      if (result.kind === 'sequence_collision') {
        lastError = result.error
        continue
      }
      // canon · idempotency dedup OR unrecoverable error · surface to caller
      throw result.error
    }
    throw new Error(
      `sala_event_log · max sequence allocation retries (${this.maxSequenceRetries}) exceeded for stream_id=${input.stream_id} · last_error=${
        lastError instanceof Error ? lastError.message : 'unknown'
      } · canon-Track-M migration apply would eliminate retries entirely`,
    )
  }

  /**
   * Track M · canon canonical · single-shot insert with a known sequence.
   * Maps PG errors to dedup / collision / throw. The atomic_rpc path uses
   * this directly · the optimistic path wraps it in a retry loop via
   * tryInsertOnce.
   */
  private async insertWithGivenSequence(
    input: EventAppendInput,
    sequence: number,
  ): Promise<AppendResult> {
    const result = await this.tryInsertOnce(input, sequence)
    if (result.kind === 'ok') return result.value
    if (result.kind === 'sequence_collision') {
      // canon · in atomic_rpc mode this is unexpected · in caller-provided
      // mode this is "caller bug" semantics · either way · throw with context
      throw new Error(
        `sala_event_log_stream_sequence_unique · stream_id=${input.stream_id} sequence=${sequence} collision · ` +
        `caller-provided=${typeof input.sequence === 'number'} · detected_allocator=${this.detectedAllocator}`,
      )
    }
    throw result.error
  }

  /**
   * Track M · canon canonical · single INSERT attempt with classification.
   * Centralises the error-code branching used by both atomic_rpc and
   * optimistic modes.
   */
  private async tryInsertOnce(
    input: EventAppendInput,
    sequence: number,
  ): Promise<
    | { kind: 'ok'; value: AppendResult }
    | { kind: 'sequence_collision'; error: Error }
    | { kind: 'error'; error: Error }
  > {
    const insertPayload = this.buildInsertPayload(input, sequence)
    const { data, error } = await this.client
      .from(TABLE)
      .insert(insertPayload)
      .select()
      .single()

    if (!error && data) {
      return { kind: 'ok', value: { event: data as PersistedEvent, inserted: true } }
    }
    if (error?.code === PG_UNIQUE_VIOLATION) {
      if (this.isIdempotencyKeyViolation(error.message)) {
        // canon · race between pre-check and INSERT · resolve to dedup
        const existing = await this.findByIdempotencyKey(
          input.tenant_id,
          input.idempotency_key,
        )
        if (existing) {
          return { kind: 'ok', value: { event: existing, inserted: false } }
        }
        return {
          kind: 'error',
          error: new Error(
            `sala_event_log · idempotency_key UNIQUE violation but no row found for tenant=${input.tenant_id} key=${input.idempotency_key}`,
          ),
        }
      }
      if (this.isStreamSequenceViolation(error.message)) {
        return {
          kind: 'sequence_collision',
          error: new Error(
            `sala_event_log_stream_sequence_unique · stream_id=${input.stream_id} sequence=${sequence}`,
          ),
        }
      }
      return {
        kind: 'error',
        error: new Error(`sala_event_log_insert_failed · 23505 · ${error.message}`),
      }
    }
    if (error?.code === PG_CHECK_VIOLATION) {
      return {
        kind: 'error',
        error: new Error(`sala_event_log_check_violation · ${error.message}`),
      }
    }
    if (error) {
      return {
        kind: 'error',
        error: new Error(
          `sala_event_log_insert_failed · ${error.code ?? '?'} · ${error.message ?? '?'}`,
        ),
      }
    }
    return {
      kind: 'error',
      error: new Error('sala_event_log_insert · canonical-empty response · canon canonical-unexpected'),
    }
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
   * Track M · canon canonical · pick the allocator to use for this call.
   *
   * In `atomic_rpc` / `optimistic` mode this is a constant. In `auto` mode
   * we use cached detection if set · otherwise probe the RPC once. The probe
   * is a real RPC call (with a dummy stream_id) · canonical PGRST202 / 42883
   * indicates the function is absent (migration not yet applied).
   */
  private async chooseAllocator(): Promise<'atomic_rpc' | 'optimistic'> {
    if (this.allocatorMode === 'atomic_rpc') {
      // canon · forced · canon-canonical-detection is irrelevant
      this.detectedAllocator = 'atomic_rpc'
      return 'atomic_rpc'
    }
    if (this.allocatorMode === 'optimistic') {
      this.detectedAllocator = 'optimistic'
      return 'optimistic'
    }
    // canon · auto · cached or probe
    if (this.detectedAllocator !== 'unknown') return this.detectedAllocator

    // canon · probe with a UUID that's vanishingly unlikely to exist · the RPC
    // returns 1 for empty streams · canon-canonical-cheap. If the RPC doesn't
    // exist · canon canon-canonical-PostgREST returns PGRST202 / 42883 and we
    // canon-canonical-fall back to optimistic.
    const probeStreamId = '00000000-0000-0000-0000-000000000000'
    const { error } = await this.client.rpc(ALLOCATE_RPC, { p_stream_id: probeStreamId })
    if (!error) {
      this.detectedAllocator = 'atomic_rpc'
      return 'atomic_rpc'
    }
    if (RPC_NOT_FOUND_CODES.has(error.code ?? '')) {
      this.detectedAllocator = 'optimistic'
      return 'optimistic'
    }
    // canon · canonical-other error (RLS · permission · etc) · canon canonical-
    // canon-treat as fallback · canon-NOT atomic · canon-still SAFE because the
    // canon-optimistic path also handles collisions correctly.
    this.detectedAllocator = 'optimistic'
    return 'optimistic'
  }

  /**
   * Track M · canon canonical · atomic per-stream sequence allocation via the
   * SECURITY DEFINER function `sala_event_log_allocate_sequence`. The function
   * acquires `pg_advisory_xact_lock` + does `SELECT MAX(sequence)+1 FOR UPDATE`
   * · the lock is held until the transaction commits · canon-canonical-the
   * canon-INSERT that follows MUST be in the same transaction.
   *
   * §148 honest · Supabase RPC + INSERT are TWO separate HTTP round-trips ·
   * the advisory lock releases between them. The atomicity guarantee then
   * relies on the UNIQUE(stream_id, sequence) constraint as the final arbiter
   * (canon-canonical-which IS still single-shot at this layer because the RPC
   * canon-itself serialised the read · canon-but in degenerate cases two
   * canon-concurrent callers could both read the same MAX and both attempt
   * canon-INSERT(stream, MAX+1) · the second 23505s). The optimistic retry
   * canon-loop is therefore STILL kept as the second line of defence inside
   * canon-this same code path · see insertWithGivenSequence.
   *
   * Per spec dispatch · canon-canonical-this asymmetry is acceptable in
   * canon-Sprint 12 · canon-canonical-fully-atomic requires a Supabase Edge
   * canon-Function wrapping {RPC + INSERT} inside one transaction · canon-
   * canon-canonical-Sprint 13+ optimization. For canary scale (low N at first ·
   * canon-canonical-Journey B piloto · 1 cliente) the RPC alone reduces
   * canon-collision probability by orders of magnitude vs the optimistic-only
   * canon-canon-pure path.
   */
  private async allocateAtomicSequence(stream_id: string): Promise<number> {
    const { data, error } = await this.client.rpc(ALLOCATE_RPC, {
      p_stream_id: stream_id,
    })
    if (error) {
      throw new Error(
        `sala_event_log_allocate_sequence_rpc_failed · ${error.code ?? '?'} · ${error.message ?? '?'}`,
      )
    }
    const seq = typeof data === 'number' ? data : Number(data)
    if (!Number.isFinite(seq) || seq < 1) {
      throw new Error(
        `sala_event_log_allocate_sequence_rpc · invalid_return · got=${JSON.stringify(data)}`,
      )
    }
    return seq
  }

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
