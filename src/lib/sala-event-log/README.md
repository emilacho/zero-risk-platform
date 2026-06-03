# `sala-event-log` · library interface

ADR-009 event-log library. Sprint 12 Fase 0 Track A · CC#1.

**Schema source canon canonical** · `supabase/migrations/202606021946_sala_event_log.sql`
(PR #141 · CERRADO 2026-06-02 · NO applied · §144 gated).

**Scope** · `append(event)` with idempotency dedup by business-key + `read(filters)` tenant-scoped + 1 example projection (`dispatchFunnel`). Storage adapter interface lets the lib run against an in-memory fake (tests) OR the real Supabase (post-migration apply).

**Out of scope** (per ADR-009 §CIERRE OPUS #7) · CAP enforcement (lives in router) · `cost_usd` (lives in `agent_invocations`).

---

## Quick start

```ts
import {
  append,
  read,
  buildIdempotencyKey,
  dispatchFunnel,
  InMemoryEventLogStorage,
  SupabaseEventLogStorage,
} from '@/lib/sala-event-log'

// canon canonical · pick storage adapter
const storage = new InMemoryEventLogStorage()
// canon canonical · or in prod (post §144 migration apply) ·
// const storage = new SupabaseEventLogStorage(getSupabaseAdmin())

// canon canonical · build the idempotency key (business-key dedup canon)
const idemKey = buildIdempotencyKey({
  operation_type: 'weekly_report',
  client_id: 'cliente-piloto-perez',
  logical_period: '2026-W23',
})

// canon canonical · append
const result = await append(storage, {
  tenant_id: '...',
  client_id: 'cliente-piloto-perez',
  stream_id: '...',
  correlation_id: '...',
  event_type: 'dispatch_requested',
  journey_type: 'PRODUCE',
  operation_type: 'weekly_report',
  idempotency_key: idemKey,
  logical_period: '2026-W23',
  payload: { triggered_by: 'cron' },
})
// canon canonical · result.inserted = true (new) or false (dedup hit)

// canon canonical · read (tenant-scoped REQUIRED)
const events = await read(storage, {
  tenant_id: '...',
  stream_id: '...',
  order: 'sequence_asc',
})

// canon canonical · project read-model
const buckets = dispatchFunnel(events)
```

---

## API

### `append(storage, event)`

Inserts an event. Enforces canon canonical ·
- **idempotency dedup** by `UNIQUE(tenant_id, idempotency_key)` · second call with same key returns `inserted: false` + existing row (canon canonical-the daemon-$19 case collapses transparently)
- **monotonic sequence** per stream · auto-allocated if absent · UNIQUE(stream_id, sequence) collision throws (caller retries with fresh sequence)
- **gate_type consistency** · `event_type IN (gate_pending, gate_resolved)` REQUIRES `gate_type` set · all others REQUIRE `gate_type` NULL (mirrors DB CHECK)

Returns `{ event: PersistedEvent, inserted: boolean }`.

### `read(storage, filters)`

Reads events. Requires `filters.tenant_id` (RLS-respected canon canonical · throws if absent). Optional filters · `client_id` · `stream_id` · `correlation_id` · `event_type` (single or array) · `journey_type` · `since` (ISO) · `until` (ISO) · `order` (`sequence_asc` default · `sequence_desc` · `occurred_at_desc`) · `limit` (default 100 · max 1000).

Returns `PersistedEvent[]`.

### `buildIdempotencyKey({ operation_type, client_id, logical_period, input_hash? })`

Builds the canonical business-key idempotency hash per ADR-009 §flag #1. SHA-256 hex (64 chars). `input_hash` optional (for content-aware dedup ON TOP of {op + client + period}). Throws on missing required fields.

### `hashInputContent(value)`

Helper · stable SHA-256 hex of arbitrary serializable content (sorted keys for objects · order-sensitive for arrays). Use to populate `input_hash` for content-aware dedup.

### `dispatchFunnel(events)`

Example projection · groups events by `stream_id` · counts per `event_type`. Returns `DispatchFunnelBucket[]` sorted by `first_occurred_at` ascending. Pure function · canon canonical-stateless · feed it the output of `read()`.

---

## Storage adapters

### `InMemoryEventLogStorage`

In-memory fake. Mirrors DB semantics exactly (UNIQUE constraints · CHECK · monotonic sequence · tenant filter). Canon canonical-test substrate · all library tests run against this adapter.

`storage.reset()` · clears all rows + sequence state (test helper).
`storage.size` · row count (test helper).

### `SupabaseEventLogStorage`

Real prod adapter. Wraps a `SupabaseClient` (caller provides · service-role for writes per migration §5 grants). §148 honest · this adapter is **canon canonical-NOT exercised until §144 migration apply** · canon canonical-compiles + typechecks · canon canonical-tests use the in-memory adapter.

Maps DB error codes ·
- `23505` UNIQUE on `idempotency_key` → dedup (returns existing row)
- `23505` UNIQUE on `stream_id, sequence` → throws (caller retries)
- `23514` CHECK on `gate_type_consistent` → throws (caller bug)

Caller MUST allocate `sequence` per-stream (canon canonical · router responsibility per ADR-009).

---

## §148 honest

- **Schema CONSUME-only** · this lib does NOT define the schema · canon canonical-mirrors PR #141. If schema changes · types change in lockstep.
- **Tested against in-memory adapter only** · canon canonical-canonical Supabase adapter has zero runtime exercise pre-§144 migration apply.
- **No DB hit · no prod touch · no migration apply** · per spec dispatch + master plan guardrails.
- **`provenance_tag` shape OWNED here** · canon canonical canon · ADR-009 owns the definition · ADR-012 (ingress filter) CONSUMES via this lib (the costura · single source).
