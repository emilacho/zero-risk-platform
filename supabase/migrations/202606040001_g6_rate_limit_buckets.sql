-- §150 G6 · rate_limit_buckets + increment_bucket_atomic RPC
-- Sprint 12 Fase 0 · Track N (prep escalón 4 · NOT applied · canon R10 single-file).
--
-- Contract for SupabaseG6BudgetHook (src/lib/sala/g6/supabase-g6-budget-hook.ts).
-- The hook ships in code today (PR · this branch) and uses this RPC
-- when wired live in escalón 4 (§144 Emilio · separate apply step).
--
-- Migration is SINGLE-FILE per R10. To apply (escalón 4 §144) ·
--   psql ... < 202606040001_g6_rate_limit_buckets.sql
-- or via the Supabase CLI single-file path. Do NOT use `db push` per
-- canon (drift risk). Pre/post checks below verify shape.
--
-- §148 honest · this migration is NOT applied in this PR. The hook
-- defaults to noopBudgetHook in factory.ts when SALA_G6_HOOK_ENABLED
-- !== 'true' OR when no Supabase client is provided.

-- ─── PRE-CHECK ──────────────────────────────────────────────────────
-- Refuse to run if the bucket table already exists with a different
-- shape. The canon is THIS schema · drift = §144.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets'
  ) THEN
    -- Verify the canonical columns are present · refuse if missing.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'rate_limit_buckets'
        AND column_name IN ('bucket_key', 'shadow_mode', 'current_count', 'current_cost_usd')
      GROUP BY table_schema, table_name
      HAVING COUNT(DISTINCT column_name) = 4
    ) THEN
      RAISE EXCEPTION 'rate_limit_buckets exists with a DIFFERENT shape · drift · §144 review required';
    END IF;
    RAISE NOTICE 'rate_limit_buckets already present with canonical shape · CREATE TABLE IF NOT EXISTS is no-op below';
  END IF;
END $$;

-- ─── TABLE · rate_limit_buckets ─────────────────────────────────────
-- Canon shape · matches the columns the agent-safety v1/v2 spec
-- declared (§150 G6) + the SupabaseG6BudgetHook contract.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  -- The opaque identifier the BudgetPolicy carries (executor-contract.ts).
  -- Format · "scope:tier:resource" · e.g. "client:c-abc:onboard.brand"
  bucket_key TEXT PRIMARY KEY,

  -- Cap scope tier · for forensic queries + per-tier rollouts.
  -- One of · global · per_client · per_journey · per_operation · per_tool · per_agent · per_workflow.
  scope TEXT NOT NULL,

  -- Caps · at least ONE must be non-null (CHECK enforces).
  max_count BIGINT,
  max_cost_usd NUMERIC(12, 6),

  -- Rolling window · NULL = no window (lifetime cap).
  -- When NOT NULL · the RPC resets current_* when window_started_at + window_seconds <= NOW().
  window_seconds INTEGER,

  -- Per-bucket shadow mode · canon §150 v1/v2 spec. TRUE = log-only
  -- (no enforce) even when the hook is in 'live' mode. Default TRUE
  -- so new buckets start in shadow until promoted by §144.
  shadow_mode BOOLEAN NOT NULL DEFAULT TRUE,

  -- Counters · updated atomically by the RPC.
  current_count BIGINT NOT NULL DEFAULT 0,
  current_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit · authored + last modified.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (max_count IS NOT NULL OR max_cost_usd IS NOT NULL),
  CHECK (max_count IS NULL OR max_count > 0),
  CHECK (max_cost_usd IS NULL OR max_cost_usd > 0),
  CHECK (window_seconds IS NULL OR window_seconds > 0)
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_scope_idx
  ON public.rate_limit_buckets (scope);

-- ─── RPC · increment_bucket_atomic ──────────────────────────────────
-- SECURITY DEFINER + FOR UPDATE lock · matches Opus's prescribed
-- shape for the atomic counter (§142 + §150). Single transaction
-- per call · read-check-increment.
--
-- Returns one row · the caller (SupabaseG6BudgetHook) reads the
-- `exhausted` flag + the remaining caps + the per-bucket
-- shadow_mode_db echo.

CREATE OR REPLACE FUNCTION public.increment_bucket_atomic(
  p_bucket_key TEXT,
  p_cost_usd NUMERIC DEFAULT 0
) RETURNS TABLE (
  exhausted BOOLEAN,
  remaining_cost_usd NUMERIC,
  remaining_steps BIGINT,
  shadow_mode_db BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket public.rate_limit_buckets%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_window_expired BOOLEAN := FALSE;
BEGIN
  -- Lock the row · canon FOR UPDATE for atomic increment.
  SELECT * INTO v_bucket
    FROM public.rate_limit_buckets
   WHERE bucket_key = p_bucket_key
     FOR UPDATE;

  IF NOT FOUND THEN
    -- Unknown bucket · fail-OPEN with shadow_mode_db=TRUE so the
    -- caller logs but does not block. This matches the §148 cap
    -- contract · unknown buckets are NEVER a hard fail.
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::BIGINT, TRUE;
    RETURN;
  END IF;

  -- Window expiry check · reset counters if window elapsed.
  IF v_bucket.window_seconds IS NOT NULL
     AND v_bucket.window_started_at + (v_bucket.window_seconds || ' seconds')::INTERVAL <= v_now THEN
    v_window_expired := TRUE;
  END IF;

  IF v_window_expired THEN
    UPDATE public.rate_limit_buckets
       SET current_count = 1,
           current_cost_usd = COALESCE(p_cost_usd, 0),
           window_started_at = v_now,
           updated_at = v_now
     WHERE bucket_key = p_bucket_key;
    RETURN QUERY SELECT
      FALSE,
      (v_bucket.max_cost_usd - COALESCE(p_cost_usd, 0))::NUMERIC,
      (v_bucket.max_count - 1)::BIGINT,
      v_bucket.shadow_mode;
    RETURN;
  END IF;

  -- Exhaustion check · BEFORE increment · do not over-commit.
  IF (v_bucket.max_count IS NOT NULL
       AND v_bucket.current_count >= v_bucket.max_count)
     OR (v_bucket.max_cost_usd IS NOT NULL
         AND v_bucket.current_cost_usd + COALESCE(p_cost_usd, 0) > v_bucket.max_cost_usd)
  THEN
    -- Exhausted · do NOT increment · return remaining=0 so the caller
    -- has a clean number for the event log.
    RETURN QUERY SELECT
      TRUE,
      GREATEST(0::NUMERIC,
        COALESCE(v_bucket.max_cost_usd - v_bucket.current_cost_usd, 0::NUMERIC)),
      GREATEST(0::BIGINT,
        COALESCE(v_bucket.max_count - v_bucket.current_count, 0::BIGINT)),
      v_bucket.shadow_mode;
    RETURN;
  END IF;

  -- OK · atomic increment.
  UPDATE public.rate_limit_buckets
     SET current_count = current_count + 1,
         current_cost_usd = current_cost_usd + COALESCE(p_cost_usd, 0),
         updated_at = v_now
   WHERE bucket_key = p_bucket_key;

  RETURN QUERY SELECT
    FALSE,
    (v_bucket.max_cost_usd - (v_bucket.current_cost_usd + COALESCE(p_cost_usd, 0)))::NUMERIC,
    (v_bucket.max_count - (v_bucket.current_count + 1))::BIGINT,
    v_bucket.shadow_mode;
END;
$$;

-- service_role bypasses RLS · grant explicit so the SupabaseG6BudgetHook
-- (running as the admin client) can call the RPC.
GRANT EXECUTE ON FUNCTION public.increment_bucket_atomic(TEXT, NUMERIC) TO service_role;

-- ─── POST-CHECK ─────────────────────────────────────────────────────
-- Verify the canonical shape landed.

DO $$
BEGIN
  PERFORM 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POST-CHECK · rate_limit_buckets MISSING';
  END IF;

  PERFORM 1 FROM information_schema.routines
   WHERE routine_schema = 'public' AND routine_name = 'increment_bucket_atomic';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POST-CHECK · increment_bucket_atomic RPC MISSING';
  END IF;

  RAISE NOTICE 'POST-CHECK · rate_limit_buckets + increment_bucket_atomic present · OK';
END $$;
