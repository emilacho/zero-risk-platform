-- Migration · agent_invocations · promote 4 columns to NOT NULL
-- Sprint 11 Ola 1 derivado #4 (cimiento Track 3 §[A.5] candidatas P0/P1)
-- Owner · CC#3 · dispatch Lenovo · §144 phase ratificada
-- Date · 2026-06-01 11:05 UTC
--
-- Context canon canónica · CC#3 barrido NULL canon canon §[A.2]/§[A.5] verified
-- 0% NULL en 4 cols sobre 1354 filas live · re-verified GT 2026-06-01 11:05Z.
-- Re-verify queries · count(*) WHERE col IS NULL = 0 para cada una.
--
-- Gates duros honored canon canon §148 ·
--   * NO toca workflow_id (97.6% NULL legacy · Fase 0 policy `legacy-pre-§149`)
--   * NO toca client_id (7.4% NULL · 100 filas legacy · cleanup separate)
--   * NO pisa endpoint §149 CC#2 (archivo separado)
--
-- Apply path · supabase CLI db push o psql direct con DATABASE_URL
-- Verify post-apply · 4 queries · information_schema.columns is_nullable = 'NO'
-- Rollback · ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL (4 statements)

BEGIN;

-- Defensive guard · re-confirm 0 NULLs antes de promote (fails-fast si drift)
DO $$
DECLARE
  v_null_cost_usd INTEGER;
  v_null_agent_name INTEGER;
  v_null_model INTEGER;
  v_null_num_turns INTEGER;
BEGIN
  SELECT count(*) INTO v_null_cost_usd FROM public.agent_invocations WHERE cost_usd IS NULL;
  SELECT count(*) INTO v_null_agent_name FROM public.agent_invocations WHERE agent_name IS NULL;
  SELECT count(*) INTO v_null_model FROM public.agent_invocations WHERE model IS NULL;
  SELECT count(*) INTO v_null_num_turns FROM public.agent_invocations WHERE num_turns IS NULL;

  IF v_null_cost_usd > 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAIL · cost_usd has % NULL rows · aborting NOT NULL promotion', v_null_cost_usd;
  END IF;
  IF v_null_agent_name > 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAIL · agent_name has % NULL rows · aborting NOT NULL promotion', v_null_agent_name;
  END IF;
  IF v_null_model > 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAIL · model has % NULL rows · aborting NOT NULL promotion', v_null_model;
  END IF;
  IF v_null_num_turns > 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAIL · num_turns has % NULL rows · aborting NOT NULL promotion', v_null_num_turns;
  END IF;

  RAISE NOTICE 'PRE-CHECK PASS · all 4 columns have 0 NULLs · proceeding with NOT NULL promotion';
END $$;

-- Promote 4 columns to NOT NULL · agent_invocations
ALTER TABLE public.agent_invocations
  ALTER COLUMN cost_usd SET NOT NULL;

ALTER TABLE public.agent_invocations
  ALTER COLUMN agent_name SET NOT NULL;

ALTER TABLE public.agent_invocations
  ALTER COLUMN model SET NOT NULL;

ALTER TABLE public.agent_invocations
  ALTER COLUMN num_turns SET NOT NULL;

-- Post-check assertion · constraint active
DO $$
DECLARE
  v_nullable_count INTEGER;
BEGIN
  SELECT count(*)
    INTO v_nullable_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'agent_invocations'
     AND column_name IN ('cost_usd', 'agent_name', 'model', 'num_turns')
     AND is_nullable = 'YES';

  IF v_nullable_count > 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAIL · % of 4 target columns still nullable · rollback', v_nullable_count;
  END IF;

  RAISE NOTICE 'POST-CHECK PASS · all 4 columns are NOT NULL · migration complete';
END $$;

COMMIT;

-- ─── Verification queries (run post-apply manually) ───────────────────────
--
-- 1. Confirm 4 columns are NOT NULL
--    SELECT column_name, is_nullable
--      FROM information_schema.columns
--     WHERE table_schema = 'public'
--       AND table_name = 'agent_invocations'
--       AND column_name IN ('cost_usd', 'agent_name', 'model', 'num_turns');
--
-- 2. Confirm NULL inserts now fail (expect: null value in column "cost_usd" violates not-null constraint)
--    INSERT INTO public.agent_invocations (session_id, agent_id, started_at, status, created_at)
--      VALUES (gen_random_uuid(), 'test-agent', NOW(), 'pending', NOW());
--
-- ─── Rollback (only if needed · paste manually into psql) ─────────────────
--
-- BEGIN;
--   ALTER TABLE public.agent_invocations ALTER COLUMN cost_usd DROP NOT NULL;
--   ALTER TABLE public.agent_invocations ALTER COLUMN agent_name DROP NOT NULL;
--   ALTER TABLE public.agent_invocations ALTER COLUMN model DROP NOT NULL;
--   ALTER TABLE public.agent_invocations ALTER COLUMN num_turns DROP NOT NULL;
-- COMMIT;
