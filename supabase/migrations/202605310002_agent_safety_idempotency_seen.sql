-- Migration · agent_safety_idempotency_seen · PR #128 build-phase
-- Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §7.2
-- Canon · §150 G3 idempotency
--
-- Purpose · canonical dedup store for checkIdempotency gate. Atomic
-- INSERT ON CONFLICT DO NOTHING enforces uniqueness per key. Rows older
-- than 7 days pruned by daily cron (separate canon canonical task).

CREATE TABLE public.agent_safety_idempotency_seen (
  key TEXT PRIMARY KEY,                      -- canonical idempotency key (UUID or computed sha256)
  ctx JSONB NOT NULL,                        -- snapshot · audit + debugging
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idempotency_seen_at ON public.agent_safety_idempotency_seen (seen_at DESC);

ALTER TABLE public.agent_safety_idempotency_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_only_idempotency ON public.agent_safety_idempotency_seen
  USING (current_setting('request.jwt.claims', true)::json->>'role' IN ('admin_emilio', 'service_role'));

COMMENT ON TABLE public.agent_safety_idempotency_seen IS
  'PR #128 v2 §7.2 · dedup store for §150 G3 checkIdempotency gate · 10-min window default · 7-day prune';
