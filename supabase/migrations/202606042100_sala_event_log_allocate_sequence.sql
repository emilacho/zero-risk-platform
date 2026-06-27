-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration · sala_event_log_allocate_sequence · Track M Sprint 12 Fase 0  ║
-- ║                                                                          ║
-- ║ Sprint 12 Fase 0 · Track M · authored CC#1 · NO apply (apply = §144      ║
-- ║ al escalar canary)                                                       ║
-- ║                                                                          ║
-- ║ Cierra el riesgo #1 (canon canonical · confirmado EN VIVO escalón 1 ·    ║
-- ║ 2026-06-04T08:03 · harness 03-race-sequence reportó max_retry_attempts=6 ║
-- ║ a N=10 · adapter Track J default 5 quedaría on the edge bajo más carga). ║
-- ║                                                                          ║
-- ║ Reemplaza el allocator OPTIMISTA (`SELECT MAX(sequence)+1` + UNIQUE      ║
-- ║ catch + retry · ADR-009 §sequence-monotonic + Track J §148 honest        ║
-- ║ caveat) por un allocator ATÓMICO via SECURITY DEFINER function con      ║
-- ║ `pg_advisory_xact_lock` per-stream lock + `SELECT ... FOR UPDATE` para  ║
-- ║ guarantee single-allocator-at-a-time per stream.                        ║
-- ║                                                                          ║
-- ║ Backward-compat canon · el adapter (`SupabaseEventLogStorage`) usa el   ║
-- ║ RPC SI existe en el schema · cae al optimista canonical-SI-no-existe   ║
-- ║ (canon canon-tests adapter · canon-fallback-test). Esto permite shippear ║
-- ║ el código ANTES de aplicar la migración · seguro porque la migración    ║
-- ║ está §144-gated.                                                        ║
-- ║                                                                          ║
-- ║ Refs ·                                                                   ║
-- ║   - 00-meta/opus-4-8-traspaso/ENCENDIDO-prep-paralela-2026-06-04.md     ║
-- ║   - 00-meta/opus-4-8-traspaso/ADR-009-event-log-schema-Fase0-kickoff.md ║
-- ║   - PR #147 (Track J supabase adapter optimista)                        ║
-- ║   - Live evidence escalón 1 · raw/2026-06-04T08:03 03-race-sequence     ║
-- ║   - Canon §148 (honest evidence-based) · §151 (vendor lock-in)          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Pre-check · table sala_event_log MUST exist (PR #141 applied)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sala_event_log'
  ) THEN
    RAISE EXCEPTION 'sala_event_log table missing · apply PR #141 migration first (202606021946_sala_event_log.sql)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Function · sala_event_log_allocate_sequence(p_stream_id)
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER · runs as owner (postgres) to bypass RLS for the
-- internal SELECT. The RPC itself is grant-controlled (service_role
-- only · GRANT below). Authenticated/anon canon canonical-NO grant.
--
-- Concurrency model canon ·
--   1. pg_advisory_xact_lock(hashtext(stream_id)) · per-stream serialiser
--      · scope is the transaction · auto-released on commit/rollback
--      · NO long-lived locks · canon canonical-cheap
--   2. SELECT MAX(sequence)+1 FROM sala_event_log WHERE stream_id=$1
--      with FOR UPDATE on the candidate row (if any) · belt-and-suspenders
--      against the advisory lock
--   3. RETURNS the next sequence number · caller does INSERT with this
--      sequence WITHIN THE SAME TRANSACTION (advisory lock holds until
--      commit so INSERT lands before another caller can allocate).
--
-- §148 honest canon ·
--   - The advisory lock is hashed (int8) · collisions exist (2^-63 ish ·
--     stream_id is UUID so hash distribution is uniform · canon-canonical
--     collision means two unrelated streams briefly serialise · canon-NOT
--     correctness · canon-just throughput · acceptable).
--   - This function MUST be called inside a transaction that ALSO does
--     the INSERT (otherwise the lock releases before INSERT and the
--     guarantee breaks). The adapter wraps RPC + INSERT in a single
--     Supabase RPC call where possible · or two-step with explicit
--     transaction · documented in adapter.
--
-- Caller pattern canon (preferred · single-transaction · canon-canonical-
-- atomicity) · see adapter ·
--   BEGIN;
--     SELECT sala_event_log_allocate_sequence($stream);  -- lock + alloc
--     INSERT INTO sala_event_log (stream_id, sequence, ...) VALUES (...);
--   COMMIT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sala_event_log_allocate_sequence'
  ) THEN
    -- canon canonical · drop existing for clean replace (idempotent)
    DROP FUNCTION IF EXISTS public.sala_event_log_allocate_sequence(UUID);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sala_event_log_allocate_sequence(
  p_stream_id UUID
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key BIGINT;
  v_next_seq BIGINT;
BEGIN
  -- canon · per-stream advisory lock · transaction-scoped · auto-released
  v_lock_key := hashtextextended(p_stream_id::TEXT, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- canon · belt-and-suspenders · FOR UPDATE on the current MAX row
  -- (locks no rows when stream is empty · which is the common path)
  SELECT COALESCE(MAX(sequence), 0) + 1
    INTO v_next_seq
    FROM public.sala_event_log
   WHERE stream_id = p_stream_id
   FOR UPDATE;

  RETURN v_next_seq;
END;
$$;

COMMENT ON FUNCTION public.sala_event_log_allocate_sequence(UUID) IS
  'Track M · atomic per-stream sequence allocator · pg_advisory_xact_lock + FOR UPDATE · '
  'must be called inside the same transaction as the INSERT · §148 hash collisions '
  'briefly serialise unrelated streams (acceptable throughput tradeoff).';

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · Grants · service_role only (RLS bypass canon canonical-not relevant
-- since SECURITY DEFINER runs as owner · but we still REVOKE from PUBLIC
-- + GRANT service_role only · canon-canonical-defense in depth).
-- ─────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.sala_event_log_allocate_sequence(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sala_event_log_allocate_sequence(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.sala_event_log_allocate_sequence(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sala_event_log_allocate_sequence(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4 · Post-check · function exists + service_role can execute
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sala_event_log_allocate_sequence'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'post-check · sala_event_log_allocate_sequence function not created';
  END IF;
END $$;

COMMIT;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ROLLBACK (canonical canon canon-inline · run manually if apply fails)   ║
-- ║ BEGIN;                                                                   ║
-- ║   DROP FUNCTION IF EXISTS public.sala_event_log_allocate_sequence(UUID);║
-- ║ COMMIT;                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
