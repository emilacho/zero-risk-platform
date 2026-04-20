-- ═══════════════════════════════════════════════════════════════════
-- Zero Risk — Ola 3: Workflow stub tables
-- Purpose: create minimal tables that the 45 research-generated workflows
-- write to, so smoke tests validate end-to-end plumbing without requiring
-- full production schema design yet.
--
-- Schema philosophy: generic (id + client_id + data jsonb + timestamps).
-- Real production versions will replace these with typed columns + indexes.
--
-- Idempotent: safe to re-run (all use CREATE TABLE IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════

-- Helper: create a generic stub table with the canonical Zero Risk columns
-- (client_id, data jsonb, created_at). Must be called via dynamic SQL since
-- PostgreSQL plpgsql variables can't be used in DDL directly; we inline below.

BEGIN;

-- Email Lifecycle Orchestrator
CREATE TABLE IF NOT EXISTS public.email_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  contact_id text,
  sequence_type text,             -- contact_created | cart_abandoned | etc.
  sequence_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_sequences_client ON email_sequences(client_id);
CREATE INDEX IF NOT EXISTS idx_email_sequences_created ON email_sequences(created_at DESC);

-- Subject Line A/B Validator
CREATE TABLE IF NOT EXISTS public.subject_line_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  test_type text,                 -- aa_control | ab_test | schwedelson_check
  subject_a text,
  subject_b text,
  segment_size integer,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subject_line_tests_client ON subject_line_tests(client_id);

-- Influencer Authenticity Gate
CREATE TABLE IF NOT EXISTS public.influencer_approved_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  influencer_handle text NOT NULL,
  platform text,
  authenticity_score numeric,
  data jsonb DEFAULT '{}'::jsonb,
  approved_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.influencer_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  influencer_handle text,
  platform text,
  rejection_reason text,
  data jsonb DEFAULT '{}'::jsonb,
  rejected_at timestamptz DEFAULT now()
);

-- Review Severity Tier Router
CREATE TABLE IF NOT EXISTS public.review_responses_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  review_id text,
  platform text,
  tier text,                      -- tier1 | tier2 | tier3
  draft_response text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Sentry Alert Router + UptimeRobot
CREATE TABLE IF NOT EXISTS public.error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text,
  source text,                    -- sentry | manual | etc.
  severity text,                  -- P0 | P1 | P2
  title text,
  environment text,
  url text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_events_fingerprint ON error_events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_events_created ON error_events(created_at DESC);

CREATE TABLE IF NOT EXISTS public.uptime_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_url text,
  monitor_name text,
  alert_type integer,             -- UptimeRobot: 1=down, 2=up, etc.
  alert_details text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Client Success workflows
CREATE TABLE IF NOT EXISTS public.churn_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  churn_risk_score numeric,
  prediction_horizon_days integer DEFAULT 90,
  signals jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rfm_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  contact_id text,
  recency_score integer,
  frequency_score integer,
  monetary_score integer,
  segment_label text,             -- champions | at-risk | hibernating | etc.
  data jsonb DEFAULT '{}'::jsonb,
  computed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  platform text,                  -- discord | slack | circle | etc.
  health_score numeric,
  metrics jsonb DEFAULT '{}'::jsonb,
  computed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expansion_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  opportunity_type text,
  estimated_value_usd numeric,
  readiness_score numeric,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Ops / Monitoring
CREATE TABLE IF NOT EXISTS public.agent_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL,
  latency_p50_ms integer,
  latency_p95_ms integer,
  latency_p99_ms integer,
  error_rate numeric,
  measured_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_health_metrics_slug ON agent_health_metrics(agent_slug);
CREATE INDEX IF NOT EXISTS idx_agent_health_metrics_time ON agent_health_metrics(measured_at DESC);

-- Video Pipeline / Content Repurposing
CREATE TABLE IF NOT EXISTS public.content_fetch_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  pillar_id text,
  source_url text,
  content jsonb DEFAULT '{}'::jsonb,
  fetched_at timestamptz DEFAULT now()
);

-- Client Brain RAG (simple snapshot store for now — real embeddings later)
CREATE TABLE IF NOT EXISTS public.client_brain_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  snapshot_type text,             -- brand_context | style_guide | voc | icp | competitive
  content jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_brain_snapshots_client ON client_brain_snapshots(client_id);

-- Permissions: service role has RW, authenticated role has read
DO $$
DECLARE
  tbl_name text;
  tables_arr text[] := ARRAY[
    'email_sequences','subject_line_tests','influencer_approved_list',
    'influencer_rejections','review_responses_queue','error_events',
    'uptime_incidents','churn_predictions','rfm_segments','community_health',
    'expansion_opportunities','agent_health_metrics','content_fetch_cache',
    'client_brain_snapshots'
  ];
BEGIN
  FOREACH tbl_name IN ARRAY tables_arr LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl_name);
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON public.%I', tbl_name);
    EXECUTE format('CREATE POLICY "service_role_all" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl_name);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_read" ON public.%I', tbl_name);
    EXECUTE format('CREATE POLICY "authenticated_read" ON public.%I FOR SELECT TO authenticated USING (true)', tbl_name);
  END LOOP;
END $$;

COMMIT;

-- Verify
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN (
  'email_sequences','subject_line_tests','influencer_approved_list',
  'influencer_rejections','review_responses_queue','error_events',
  'uptime_incidents','churn_predictions','rfm_segments','community_health',
  'expansion_opportunities','agent_health_metrics','content_fetch_cache',
  'client_brain_snapshots'
)
ORDER BY table_name;
