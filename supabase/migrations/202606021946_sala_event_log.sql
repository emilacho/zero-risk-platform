-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration · sala_event_log · ADR-009 (ronda 3 + CIERRE OPUS #7 · 2026-06-02)
-- ║                                                                          ║
-- ║ Sprint 12 Fase 0 · build · authored CC#3 · NO apply (apply = §144)       ║
-- ║                                                                          ║
-- ║ Append-only AUTORITATIVE event log of the sala (control plane). All      ║
-- ║ orchestration state derives from this log (router + projector pattern).  ║
-- ║                                                                          ║
-- ║ Schema CERRADO per Opus 2026-06-02 (ADR-009-event-log-schema-Fase0       ║
-- ║ -kickoff.md §CIERRE OPUS #7) · 22 columns + 3 enums + 4 indexes + RLS    ║
-- ║ tenant-scoped from day 1.                                                ║
-- ║                                                                          ║
-- ║ Out of scope (per CIERRE OPUS #7):                                       ║
-- ║   - The CAP / dispatch budget enforcement does NOT live here. It is      ║
-- ║     enforced by the atomic counter (rate_limit_buckets +                 ║
-- ║     increment_bucket_atomic = G6) at the router · this log only          ║
-- ║     RECORDS the `budget_blocked` event when the counter trips.           ║
-- ║   - `cost_usd` does NOT live here. It lives in `agent_invocations`       ║
-- ║     (the LLM ledger). This log REFERENCES it via `agent_invocation_ref`. ║
-- ║                                                                          ║
-- ║ Refs:                                                                    ║
-- ║   - 00-meta/opus-4-8-traspaso/ADR-009-event-log-schema-Fase0-kickoff.md  ║
-- ║   - 00-meta/opus-4-8-traspaso/spec-CC3-event-log-migration-author.md     ║
-- ║   - Canon §148 (honest evidence-based) · §151 (vendor lock-in mitigation) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · ENUMs · 3 types (event_type · step_state · gate_type)
-- ─────────────────────────────────────────────────────────────────────────

-- event_type · 10 values per ADR-009 ronda 3 §Enum + §H additions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sala_event_type_enum') THEN
    CREATE TYPE public.sala_event_type_enum AS ENUM (
      'dispatch_requested',
      'step_started',
      'step_completed',
      'step_failed',
      'handoff',
      'gate_pending',
      'gate_resolved',
      'needs_judgment',     -- §H-a · off-script handler · router = total function
      'judgment_resolved',  -- §H-a · resume after coordinator-agent or HITL decision
      'budget_blocked'      -- §H-d + CIERRE OPUS #7 · cap dispara · G6 bucket already blocked
    );
  END IF;
END $$;

-- step_state · 4 values per ADR-009 ronda 3 field #17
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sala_step_state_enum') THEN
    CREATE TYPE public.sala_step_state_enum AS ENUM (
      'pending',
      'running',
      'done',
      'failed'
    );
  END IF;
END $$;

-- gate_type · 3 values per ADR-009 ronda 3 §H flag #5 (camino_iii_gate generalization)
-- · set when event_type IN (gate_pending, gate_resolved) · NULL otherwise
-- · '§144' uses the literal section sign per ADR-009 spec · valid as enum string value
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sala_gate_type_enum') THEN
    CREATE TYPE public.sala_gate_type_enum AS ENUM (
      'hitl',          -- human-in-the-loop · operator review
      'camino_iii',    -- Critical Creative Gate · 3-of-N reviewer voting
      '§144'           -- admin gerencial gate · Emilio canon §144 decisions
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · TABLE · sala_event_log · 22 columns (18 base + 4 structural)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sala_event_log (
  -- ─── 18 base columns per ADR-009 ronda 3 §Los 18 campos ──────────────
  event_id          UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence          BIGINT                     NOT NULL,               -- monotonic order per stream (flag #3 · not wall-clock)
  occurred_at       TIMESTAMPTZ                NOT NULL DEFAULT now(), -- wall clock · observability ONLY · NOT authoritative for order
  tenant_id         UUID                       NOT NULL,               -- multi-tenant isolation · RLS-scoped from day 1 (Q5)
  client_id         UUID                       NOT NULL,               -- business entity · part of idempotency key + CAP scope
  stream_id         UUID                       NOT NULL,               -- journey/campaign instance · sequence is per-stream
  correlation_id    UUID                       NOT NULL,               -- end-to-end traza of a logical operation
  causation_id      UUID                       NULL,                   -- event_id of CAUSE event · handoff cadena causal vía log
  event_type        public.sala_event_type_enum NOT NULL,              -- what happened (10 values · §H included)
  journey_type      TEXT                       NOT NULL,               -- libreto (A/B/C/D/E/NEXUS/...) · routing + CAP scope
  operation_type    TEXT                       NOT NULL,               -- business operation · part of idempotency key
  idempotency_key   TEXT                       NOT NULL UNIQUE,        -- hash of {operation_type + client_id + logical_period (+ input_hash)}
  logical_period    TEXT                       NOT NULL,               -- period/cause scoping operation · part of idempotency key
  input_hash        TEXT                       NULL,                   -- optional component of idempotency_key (per flag #1)
  workflow_run_id   TEXT                       NULL,                   -- opaque ejecutor run id (vendor-agnostic · §151 leak-free)
  step_id           TEXT                       NULL,                   -- step within the run · memoization correlation
  step_state        public.sala_step_state_enum NULL,                  -- pending|running|done|failed (NULL when not a step event)
  attempt           INT                        NULL,                   -- ejecutor retry counter

  -- ─── 4 structural / link columns ─────────────────────────────────────
  payload           JSONB                      NOT NULL DEFAULT '{}'::jsonb,  -- event data · if external content (ADR-012) provenance_tag persists
  provenance_tag    JSONB                      NULL,                   -- OWNED by ADR-009 · consumed by ADR-012 · top-level for queryability
  agent_invocation_ref UUID                    NULL,                   -- FK to agent_invocations.id (LLM cost ledger · cost_usd NOT here)
  gate_type         public.sala_gate_type_enum NULL,                   -- set when event_type IN (gate_pending, gate_resolved) (flag #5)

  -- ─── Bookkeeping ─────────────────────────────────────────────────────
  created_at        TIMESTAMPTZ                NOT NULL DEFAULT now(), -- audit trail · row insert time

  -- ─── Cross-column invariants ─────────────────────────────────────────
  -- gate_type MUST be set IF event is a gate · NULL otherwise (flag #5)
  CONSTRAINT sala_event_log_gate_type_consistent CHECK (
    (event_type IN ('gate_pending', 'gate_resolved') AND gate_type IS NOT NULL)
    OR (event_type NOT IN ('gate_pending', 'gate_resolved') AND gate_type IS NULL)
  ),

  -- sequence per stream is monotonic · enforced at write-time by router
  -- · this UNIQUE constraint codifies "no two events share the same slot
  --   in the same stream" (orden total per-stream from §flag #3)
  CONSTRAINT sala_event_log_stream_sequence_unique UNIQUE (stream_id, sequence)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · FOREIGN KEYS (canon §150 G4 referential integrity to ledger)
-- ─────────────────────────────────────────────────────────────────────────
-- Reference to agent_invocations (the LLM cost/usage ledger). NOT
-- ON DELETE CASCADE · the log is append-only authoritative · agent
-- invocations may be archived/pruned separately without losing the
-- event log evidence. ON DELETE SET NULL keeps the event but breaks
-- the link cleanly.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'agent_invocations') THEN
    ALTER TABLE public.sala_event_log
      ADD CONSTRAINT sala_event_log_agent_invocation_fk
      FOREIGN KEY (agent_invocation_ref)
      REFERENCES public.agent_invocations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4 · INDEXES · 4 per spec dispatch
-- ─────────────────────────────────────────────────────────────────────────

-- (a) sequence per stream is already covered by UNIQUE (stream_id, sequence)
--     which creates an implicit B-tree index supporting (stream_id, sequence)
--     range scans · canon canon ordering queries per-stream.

-- (b) idempotency_key UNIQUE is already covered by the column-level UNIQUE
--     constraint above · creates an implicit B-tree index supporting
--     dedup lookups by key.

-- (c) correlation_id · end-to-end traza queries · canon §150 G4 observability
CREATE INDEX IF NOT EXISTS idx_sala_event_log_correlation
  ON public.sala_event_log (correlation_id, sequence);

-- (d) client_id / tenant_id · RLS policy filter + CAP scope queries
CREATE INDEX IF NOT EXISTS idx_sala_event_log_tenant_client_time
  ON public.sala_event_log (tenant_id, client_id, occurred_at DESC);

-- (e) BRIN index on occurred_at · cheap time-range scans on append-only
--     data · canon pattern from prior agent_invocations + cost_monitor_runs
CREATE INDEX IF NOT EXISTS idx_sala_event_log_occurred_at_brin
  ON public.sala_event_log USING BRIN (occurred_at);

-- (f) Partial index on causation_id for cadena causal queries (NULL-skip)
CREATE INDEX IF NOT EXISTS idx_sala_event_log_causation
  ON public.sala_event_log (causation_id)
  WHERE causation_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 5 · ROW LEVEL SECURITY · tenant-scoped from day 1 (Q5 Opus)
-- ─────────────────────────────────────────────────────────────────────────
-- · RLS ON
-- · deny-all to anon (no policy → automatic deny)
-- · service_role bypasses RLS (Supabase default · used by sala router/projector)
-- · authenticated/operator read scoped to tenant_id from JWT claim
-- · admin role pattern from ingress_filter_tables.sql canon precedent

ALTER TABLE public.sala_event_log ENABLE ROW LEVEL SECURITY;

-- Explicit revoke from anon · belt-and-suspenders (RLS ON alone denies, this
-- removes the GRANT level too so even RLS-bypass attempts (service_role
-- impersonation) cannot read without proper role).
REVOKE ALL ON public.sala_event_log FROM PUBLIC;
REVOKE ALL ON public.sala_event_log FROM anon;

-- Authenticated · scoped read by tenant_id from JWT claim
DROP POLICY IF EXISTS sala_event_log_tenant_scoped_read ON public.sala_event_log;
CREATE POLICY sala_event_log_tenant_scoped_read ON public.sala_event_log
  FOR SELECT
  TO authenticated
  USING (
    tenant_id::text = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'tenant_id',
      ''
    )
    OR
    current_setting('request.jwt.claims', true)::json->>'role'
      IN ('admin_emilio', 'service_role')
  );

-- service_role · explicit SELECT + INSERT grant for the sala backend
-- (router + projector). service_role bypasses RLS by default in Supabase
-- but explicit grants document intent.
GRANT SELECT, INSERT ON public.sala_event_log TO service_role;

-- authenticated · SELECT only (read-only · log is append-only authoritative
-- · ALL writes go through service_role via the sala router)
GRANT SELECT ON public.sala_event_log TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6 · COMMENTS · schema documentation in-database (canon §148 evidence)
-- ─────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sala_event_log IS
  'ADR-009 · append-only authoritative event log of the sala (control plane). '
  'All orchestration state derives from this log via projection pattern. '
  'Schema CERRADO per Opus 2026-06-02. Sprint 12 Fase 0.';

COMMENT ON COLUMN public.sala_event_log.sequence IS
  'Monotonic order per stream (flag #3) · UNIQUE(stream_id, sequence) enforces. '
  'NOT confused with occurred_at (wall clock · observability only).';

COMMENT ON COLUMN public.sala_event_log.idempotency_key IS
  'Hash of {operation_type + client_id + logical_period [+ input_hash]} per '
  'flag #1. The daemon $19 case (mismo trabajo, distintos execution_id) '
  'collapses to the same key · UNIQUE constraint = the dedup.';

COMMENT ON COLUMN public.sala_event_log.workflow_run_id IS
  'Opaque ejecutor run id (Inngest run id today, vendor-agnostic per §151). '
  'NOT to be parsed for vendor-specific structure.';

COMMENT ON COLUMN public.sala_event_log.agent_invocation_ref IS
  'FK to agent_invocations(id) · the LLM cost/usage ledger. cost_usd does '
  'NOT live in this log (flag #2) · rollups are derived/non-authoritative.';

COMMENT ON COLUMN public.sala_event_log.provenance_tag IS
  'OWNED by ADR-009, CONSUMED by ADR-012 (la costura). Top-level JSONB for '
  'queryability · also persists into payload when ADR-012 ingress carries '
  'external content (flag #4 · encrypt if sensitive).';

COMMENT ON COLUMN public.sala_event_log.gate_type IS
  'Set when event_type IN (gate_pending, gate_resolved). Canon §148 '
  'generalization from prior camino_iii_gate boolean to first-class gate '
  'types (flag #5). Camino III is ONE gate_type, not a special column.';

COMMENT ON CONSTRAINT sala_event_log_gate_type_consistent ON public.sala_event_log IS
  'Cross-column invariant · gate_type MUST be set IF event is a gate · '
  'NULL otherwise. Prevents accidental gate metadata on non-gate events.';

COMMENT ON CONSTRAINT sala_event_log_stream_sequence_unique ON public.sala_event_log IS
  'Orden total per-stream (flag #3) · two events cannot share the same slot '
  'within the same stream. Router writes sequence monotonically.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- POST-APPLY verification queries (run manually post §144 apply):
-- ─────────────────────────────────────────────────────────────────────────
--
-- (1) Confirm 3 enums exist with correct values
--     SELECT t.typname, e.enumlabel
--       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
--      WHERE t.typname IN ('sala_event_type_enum', 'sala_step_state_enum',
--                          'sala_gate_type_enum')
--      ORDER BY t.typname, e.enumsortorder;
--
-- (2) Confirm 22 columns + types
--     SELECT column_name, data_type, is_nullable, column_default
--       FROM information_schema.columns
--      WHERE table_schema = 'public' AND table_name = 'sala_event_log'
--      ORDER BY ordinal_position;
--
-- (3) Confirm 4+ indexes present (UNIQUE on stream_id+sequence, idempotency_key,
--     correlation, tenant/client, BRIN occurred_at, partial causation)
--     SELECT indexname, indexdef
--       FROM pg_indexes
--      WHERE schemaname = 'public' AND tablename = 'sala_event_log';
--
-- (4) Confirm RLS ON + 1 policy + grants
--     SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'sala_event_log';
--     SELECT * FROM pg_policies WHERE tablename = 'sala_event_log';
--     SELECT grantee, privilege_type FROM information_schema.role_table_grants
--      WHERE table_schema = 'public' AND table_name = 'sala_event_log';
--
-- (5) Smoke insert (service_role context · OK to dry-test then DELETE)
--     INSERT INTO public.sala_event_log
--       (sequence, tenant_id, client_id, stream_id, correlation_id,
--        event_type, journey_type, operation_type, idempotency_key,
--        logical_period, payload)
--     VALUES
--       (1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
--        gen_random_uuid(), 'dispatch_requested', 'NEXUS', 'test_op',
--        'smoke_test_' || gen_random_uuid(), '2026-06-02', '{}'::jsonb);
--
-- (6) Smoke gate-consistency CHECK enforcement (expect FAIL)
--     INSERT INTO public.sala_event_log (..., event_type='step_started',
--                                         gate_type='hitl', ...);
--     · expect: ERROR  sala_event_log_gate_type_consistent constraint violation
--
-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (only if needed · paste manually into psql):
-- ─────────────────────────────────────────────────────────────────────────
--
-- BEGIN;
--   DROP TABLE IF EXISTS public.sala_event_log CASCADE;
--   DROP TYPE  IF EXISTS public.sala_event_type_enum;
--   DROP TYPE  IF EXISTS public.sala_step_state_enum;
--   DROP TYPE  IF EXISTS public.sala_gate_type_enum;
-- COMMIT;
