-- Migration · rate_limit_buckets + rate_limit_bucket_hits + RPC · PR #128 build-phase
-- Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §0 references v1 DDL preserved
-- Canon · §150 G6 rate-limit kill-switch
--
-- Purpose · multi-grain rate buckets (per_tool · per_agent · per_workflow ·
-- per_client · global) consumed by checkRateLimit gate. Per-bucket shadow_mode
-- column allows DB-driven flip (no env change · no redeploy).
--
-- Per-bucket atomic increment via RPC increment_bucket_atomic · postgres
-- handles the race · the gate sees a final hit count.

CREATE TABLE public.rate_limit_buckets (
  bucket_id TEXT PRIMARY KEY,                -- canonical slug · e.g. 'per_workflow_nexus' · 'global_hour'
  grain TEXT NOT NULL CHECK (grain IN ('per_tool', 'per_agent', 'per_workflow', 'per_client', 'global')),
  match_key TEXT,                            -- nullable · agent_id / workflow_id / client_id depending on grain
  window_seconds INT NOT NULL CHECK (window_seconds > 0),
  max_hits INT NOT NULL CHECK (max_hits > 0),
  abort_action TEXT NOT NULL DEFAULT 'rate_limit_kill'
    CHECK (abort_action IN ('warn', 'rate_limit_kill', 'circuit_break', 'pause_workflow', 'twilio_emilio')),
  shadow_mode BOOLEAN NOT NULL DEFAULT true, -- per-bucket flip · canon canonical default shadow
  priority INT NOT NULL DEFAULT 100,         -- ascending · evaluated in this order · lower = higher priority
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limit_buckets_grain ON public.rate_limit_buckets (grain, priority);
CREATE INDEX idx_rate_limit_buckets_active ON public.rate_limit_buckets (priority) WHERE shadow_mode = false;

CREATE TABLE public.rate_limit_bucket_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL REFERENCES public.rate_limit_buckets(bucket_id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,         -- start of the bucket's window for this hit
  hits INT NOT NULL DEFAULT 1,               -- counter (incremented atomically)
  exhausted_at TIMESTAMPTZ,                  -- nullable · set when hits >= max_hits
  last_hit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_bucket_hits_window ON public.rate_limit_bucket_hits (bucket_id, window_start);
CREATE INDEX idx_bucket_hits_recent ON public.rate_limit_bucket_hits (last_hit_at DESC);
CREATE INDEX idx_bucket_hits_exhausted ON public.rate_limit_bucket_hits (exhausted_at DESC) WHERE exhausted_at IS NOT NULL;

-- RPC · atomic increment + exhausted-check in one round-trip.
-- Returns (current_hits, exhausted boolean) so caller knows if the bucket tripped.
CREATE OR REPLACE FUNCTION public.increment_bucket_atomic(
  p_bucket_id TEXT,
  p_window_start TIMESTAMPTZ,
  p_max_hits INT
)
RETURNS TABLE(current_hits INT, exhausted BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_hits INT;
BEGIN
  INSERT INTO public.rate_limit_bucket_hits (bucket_id, window_start, hits, last_hit_at)
  VALUES (p_bucket_id, p_window_start, 1, now())
  ON CONFLICT (bucket_id, window_start) DO UPDATE
    SET hits = public.rate_limit_bucket_hits.hits + 1,
        last_hit_at = now()
  RETURNING hits INTO v_hits;

  IF v_hits >= p_max_hits THEN
    UPDATE public.rate_limit_bucket_hits
    SET exhausted_at = COALESCE(exhausted_at, now())
    WHERE bucket_id = p_bucket_id AND window_start = p_window_start;
    RETURN QUERY SELECT v_hits, true;
  ELSE
    RETURN QUERY SELECT v_hits, false;
  END IF;
END;
$$;

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_bucket_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_only_buckets ON public.rate_limit_buckets
  USING (current_setting('request.jwt.claims', true)::json->>'role' IN ('admin_emilio', 'service_role'));

CREATE POLICY admin_only_hits ON public.rate_limit_bucket_hits
  USING (current_setting('request.jwt.claims', true)::json->>'role' IN ('admin_emilio', 'service_role'));

COMMENT ON TABLE public.rate_limit_buckets IS
  'PR #128 v2 §0 (v1 base) · rate-limit buckets · multi-grain · per-bucket shadow_mode flip · §150 G6 canon';
COMMENT ON TABLE public.rate_limit_bucket_hits IS
  'PR #128 v2 §0 (v1 base) · per-bucket per-window hit counter · atomic increment via increment_bucket_atomic RPC';
COMMENT ON FUNCTION public.increment_bucket_atomic IS
  'PR #128 v2 §0 (v1 base) · atomic increment + exhausted-check · returns (hits, exhausted)';
