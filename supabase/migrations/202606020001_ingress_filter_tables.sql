-- ADR-012 · filtro anti-injection ingress · build phase Sprint 12 · 80% self-contained
-- Owner · CC#1 · spec-CC1-ADR-012-build.md · ratificado §144 Emilio 2026-06-01
--
-- 3 tablas canon canonical per ADR-012 §6.2 ·
--   1. ingress_quarantine        · payload encriptado pendiente HITL review
--   2. ingress_deny_patterns     · regex deny-list versionada (EN + ES post-R6)
--   3. ingress_routes            · routing config + per-route policy (fail-open/closed · shadow_mode)
--
-- Canon hardening R7 · RLS verificada NO confiada · post-PR #125 lesson (relrowsecurity false pese a policies).
-- Smoke E2E canónico verifica anon-DENY (SELECT/INSERT/UPDATE/DELETE) + service_role-OK pre-claim done.
--
-- NO redefine provenance_tag (canon · ADR-009 esqueleto OWN · ADR-012 CONSUME).
-- NO flip enforce (canon · shadow_mode default TRUE en ingress_routes · §144-per-flip).
--
-- Idempotent · IF NOT EXISTS canon · safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1 · ingress_quarantine · payload bajo cuarentena pendiente HITL
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ingress_quarantine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                       -- 'tally_form' | 'apify_scrape' | 'whatsapp' | ...
  ingress_route TEXT NOT NULL,                -- specific endpoint or n8n workflow_id
  payload_encrypted BYTEA NOT NULL,           -- encrypted with KMS key · §150 G4 audit + privacy
  payload_size_bytes INT NOT NULL,
  payload_hash TEXT NOT NULL,                 -- sha256 for dedup
  gate_decisions JSONB NOT NULL,              -- array of {capa, verdict, severity, latency_ms}
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired_unreviewed','escalated')),
  hitl_decided_by TEXT,                       -- 'emilio_perez' OR backup HITL id
  hitl_decided_at TIMESTAMPTZ,
  hitl_reason TEXT,
  client_id UUID,                             -- if determinable from payload · NULL otherwise
  workflow_id TEXT,                           -- downstream workflow that was about to receive
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ingress_quarantine_pending
  ON public.ingress_quarantine (created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ingress_quarantine_client
  ON public.ingress_quarantine (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingress_quarantine_source
  ON public.ingress_quarantine (source, severity, created_at DESC);

ALTER TABLE public.ingress_quarantine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only_quarantine ON public.ingress_quarantine;
CREATE POLICY admin_only_quarantine ON public.ingress_quarantine
  USING (
    current_setting('request.jwt.claims', true)::json->>'role'
      IN ('admin_emilio', 'service_role')
  );

COMMENT ON TABLE public.ingress_quarantine IS
  'ADR-012 · payloads pending HITL review · encrypted at rest · RLS admin-only canon R7';

-- ─────────────────────────────────────────────────────────────────────
-- 2 · ingress_deny_patterns · regex versionada EN + ES post-R6
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ingress_deny_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id TEXT NOT NULL UNIQUE,            -- 'ignore_previous_v1' · stable id
  pattern_regex TEXT NOT NULL,                -- the regex (compiled per use)
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  scope TEXT NOT NULL CHECK (scope IN ('global','per_customer','per_source')),
  scope_value TEXT,                           -- NULL for global · customer_id or source name for scoped
  locale TEXT NOT NULL DEFAULT 'all'
    CHECK (locale IN ('en','es','all')),     -- post-R6 · audit per-locale FP rate
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingress_deny_patterns_active
  ON public.ingress_deny_patterns (scope, is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_ingress_deny_patterns_locale
  ON public.ingress_deny_patterns (locale, is_active)
  WHERE is_active = TRUE;

ALTER TABLE public.ingress_deny_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only_deny_patterns ON public.ingress_deny_patterns;
CREATE POLICY admin_only_deny_patterns ON public.ingress_deny_patterns
  USING (
    current_setting('request.jwt.claims', true)::json->>'role'
      IN ('admin_emilio', 'service_role')
  );

COMMENT ON TABLE public.ingress_deny_patterns IS
  'ADR-012 §4.2 · regex deny-list canon canonical · EN + ES post-R6 · versionada · RLS admin-only';

-- ─────────────────────────────────────────────────────────────────────
-- 3 · ingress_routes · routing config + per-route policy
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ingress_routes (
  route_id TEXT PRIMARY KEY,                  -- e.g. 'forms_submit' · 'whatsapp_inbound'
  source_type TEXT NOT NULL,                  -- 'webhook' | 'cron_poll' | 'http_pull'
  ingress_platform TEXT NOT NULL              -- post-R1
    CHECK (ingress_platform IN ('vercel','n8n','supabase_rest','daemon_local')),
  default_severity_min_quarantine TEXT NOT NULL DEFAULT 'MEDIUM',
  default_severity_min_reject TEXT NOT NULL DEFAULT 'HIGH',
  fail_mode TEXT NOT NULL DEFAULT 'fail_open'
    CHECK (fail_mode IN ('fail_open','fail_closed')),
  has_egress_capability BOOLEAN NOT NULL,     -- TRUE → downstream agent can publish/send
  has_egress_indirect_via_dispatcher_queue BOOLEAN NOT NULL DEFAULT TRUE,
    -- post-R4 · TRUE if downstream writes to ANY table polled by daemon/cron/sub-workflow trigger
    -- DEFAULT TRUE (conservador post-R4 · burden of proof recae en quien declara FALSE
    -- + evidencia "tabla X no es polled por dispatcher activo")
  shadow_mode BOOLEAN NOT NULL DEFAULT TRUE,  -- canon §144 · NUNCA flip enforce sin sign-off
  description TEXT,
  enforced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ingress_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only_routes ON public.ingress_routes;
CREATE POLICY admin_only_routes ON public.ingress_routes
  USING (
    current_setting('request.jwt.claims', true)::json->>'role'
      IN ('admin_emilio', 'service_role')
  );

COMMENT ON TABLE public.ingress_routes IS
  'ADR-012 · routing config + per-route policy · canon canonical shadow_mode DEFAULT TRUE · §144-per-flip';

-- ─────────────────────────────────────────────────────────────────────
-- Updated_at triggers canon canonical
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ingress_filter_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ingress_deny_patterns_updated_at ON public.ingress_deny_patterns;
CREATE TRIGGER trg_ingress_deny_patterns_updated_at
  BEFORE UPDATE ON public.ingress_deny_patterns
  FOR EACH ROW EXECUTE FUNCTION public.ingress_filter_set_updated_at();

DROP TRIGGER IF EXISTS trg_ingress_routes_updated_at ON public.ingress_routes;
CREATE TRIGGER trg_ingress_routes_updated_at
  BEFORE UPDATE ON public.ingress_routes
  FOR EACH ROW EXECUTE FUNCTION public.ingress_filter_set_updated_at();

COMMIT;

-- ─── Verification queries (run post-apply manually) ───────────────────────
--
-- 1. Confirm 3 tables created with RLS
--    SELECT tablename, rowsecurity FROM pg_tables
--     WHERE schemaname='public' AND tablename LIKE 'ingress_%' ORDER BY tablename;
--    Expected · 3 rows · rowsecurity = true para las 3
--
-- 2. Smoke RLS anon · expect 0 rows OR 401 (RLS denies)
--    -- via anon key client · SELECT * FROM ingress_quarantine LIMIT 1
--    -- via anon key client · INSERT INTO ingress_routes (...) VALUES (...)
--    -- expected · canon canonical 42501 insufficient_privilege
--
-- 3. service_role bypassea canon canonical
--    -- via service_role · all CRUD ops succeed
--
-- ─── Rollback (only if needed · paste to psql) ─────────────────
--
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_ingress_routes_updated_at ON public.ingress_routes;
--   DROP TRIGGER IF EXISTS trg_ingress_deny_patterns_updated_at ON public.ingress_deny_patterns;
--   DROP FUNCTION IF EXISTS public.ingress_filter_set_updated_at();
--   DROP TABLE IF EXISTS public.ingress_routes;
--   DROP TABLE IF EXISTS public.ingress_deny_patterns;
--   DROP TABLE IF EXISTS public.ingress_quarantine;
-- COMMIT;
