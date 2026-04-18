-- Zero Risk — Ola 2 (Cluster 2 Creative + Cluster 3 SEO & GEO + Cluster 4 Paid Media)
-- Session 27c / Ola 2 pre-stage
--
-- Run in Supabase SQL Editor AFTER Ola 1 (cluster_1_orchestration.sql) is applied.
-- Idempotent with CREATE TABLE IF NOT EXISTS.
--
-- 15 new tables + indexes + RLS policies.

-- ============================================================
-- CLUSTER 2 — Creative Production (4 tables)
-- ============================================================

-- 1. rsa_headline_library — RSA 15-Headline Generator output
CREATE TABLE IF NOT EXISTS rsa_headline_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  campaign_id TEXT,
  set_id TEXT UNIQUE NOT NULL,
  headlines TEXT[] NOT NULL,
  descriptions TEXT[],
  category_breakdown TEXT,
  validation_status TEXT CHECK (validation_status IN ('passed', 'failed', 'pending')),
  keyword TEXT,
  platform TEXT CHECK (platform IN ('google_ads', 'meta', 'linkedin', 'tiktok')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rsa_client ON rsa_headline_library(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rsa_set ON rsa_headline_library(set_id);

-- 2. landing_experiments — A/B Deployer output
CREATE TABLE IF NOT EXISTS landing_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  experiment_id TEXT UNIQUE NOT NULL,
  posthog_flag_key TEXT,
  variant_a_url TEXT NOT NULL,
  variant_b_url TEXT NOT NULL,
  traffic_split NUMERIC(3, 2) DEFAULT 0.5,
  kpi TEXT NOT NULL,
  sample_size_target INT,
  auto_promote_threshold NUMERIC(3, 2),
  duration_days INT,
  status TEXT CHECK (status IN ('active', 'completed', 'promoted', 'killed')),
  winner TEXT CHECK (winner IN ('a', 'b') OR winner IS NULL),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_landing_client_status ON landing_experiments(client_id, status);

-- 3. content_repurposing_queue — 1→N repurposing output
CREATE TABLE IF NOT EXISTS content_repurposing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  pillar_content_id TEXT NOT NULL,
  variant_platform TEXT NOT NULL,
  variant_content TEXT,
  variant_metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'scheduled', 'published', 'failed')),
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_repurp_client ON content_repurposing_queue(client_id, status);
CREATE INDEX IF NOT EXISTS idx_content_repurp_pillar ON content_repurposing_queue(pillar_content_id);

-- 4. creative_performance_insights — daily aggregated insights
CREATE TABLE IF NOT EXISTS creative_performance_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  audience_segment TEXT,
  creative_angle TEXT,
  platform TEXT,
  metric_roas NUMERIC(10, 4),
  metric_ctr NUMERIC(6, 4),
  metric_conversions INT,
  metric_spend NUMERIC(10, 2),
  window_days INT DEFAULT 1,
  insights JSONB DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creative_insights_client ON creative_performance_insights(client_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_insights_angle ON creative_performance_insights(creative_angle, platform);

-- ============================================================
-- CLUSTER 3 — SEO & GEO (5 tables)
-- ============================================================

-- 5. cannibalization_audits
CREATE TABLE IF NOT EXISTS cannibalization_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  audit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conflict_count INT DEFAULT 0,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  conflict_matrix JSONB DEFAULT '[]'::jsonb,
  agent_recommendations JSONB DEFAULT '{}'::jsonb,
  total_pages_scanned INT,
  total_queries INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cann_client_date ON cannibalization_audits(client_id, audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_cann_severity ON cannibalization_audits(severity, audit_date DESC);

-- 6. content_refresh_queue — GEO Content Freshness triggers
CREATE TABLE IF NOT EXISTS content_refresh_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  page_id TEXT,
  url TEXT NOT NULL,
  reason TEXT CHECK (reason IN ('geo-freshness', 'decay-risk', 'ranking-drop', 'citation-loss', 'manual')),
  citation_count INT,
  ai_platforms_cited JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '{}'::jsonb,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'completed', 'skipped')),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_content_refresh_client_status ON content_refresh_queue(client_id, status);
CREATE INDEX IF NOT EXISTS idx_content_refresh_priority ON content_refresh_queue(priority, queued_at);

-- 7. backlink_opportunities
CREATE TABLE IF NOT EXISTS backlink_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  scan_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlinked_mentions JSONB DEFAULT '[]'::jsonb,
  data_studies JSONB DEFAULT '[]'::jsonb,
  tier_a_targets JSONB DEFAULT '[]'::jsonb,
  tier_b_targets JSONB DEFAULT '[]'::jsonb,
  tier_c_targets JSONB DEFAULT '[]'::jsonb,
  total_score INT,
  outreach_queue JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_backlink_client_date ON backlink_opportunities(client_id, scan_date DESC);

-- 8. topical_authority_maps
CREATE TABLE IF NOT EXISTS topical_authority_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  pillar_topic TEXT NOT NULL,
  semantic_entities JSONB DEFAULT '[]'::jsonb,
  nlp_query_variants JSONB DEFAULT '[]'::jsonb,
  coverage_score NUMERIC(4, 3),
  decay_predictions JSONB DEFAULT '[]'::jsonb,
  refresh_calendar JSONB DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_topical_client ON topical_authority_maps(client_id, computed_at DESC);

-- 9. indexation_log
CREATE TABLE IF NOT EXISTS indexation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT CHECK (source IN ('indexnow', 'gsc_api', 'bing_fetch', 'manual')),
  status TEXT CHECK (status IN ('submitted', 'success', 'failed', 'pending')),
  response_payload JSONB DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_indexation_client ON indexation_log(client_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexation_status ON indexation_log(status);

-- ============================================================
-- CLUSTER 4 — Paid Media (6 tables)
-- ============================================================

-- 10. attribution_audits
CREATE TABLE IF NOT EXISTS attribution_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  audit_type TEXT CHECK (audit_type IN ('hourly_cross_platform', 'daily', 'campaign_end')),
  severity TEXT CHECK (severity IN ('ok', 'low', 'medium', 'high', 'critical')),
  platform_conversions JSONB DEFAULT '{}'::jsonb,
  discrepancies JSONB DEFAULT '[]'::jsonb,
  qa_results JSONB DEFAULT '[]'::jsonb,
  max_discrepancy_pct NUMERIC(6, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attr_client ON attribution_audits(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attr_severity ON attribution_audits(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attr_campaign ON attribution_audits(campaign_id);

-- 11. incrementality_tests
CREATE TABLE IF NOT EXISTS incrementality_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id TEXT UNIQUE NOT NULL,
  campaign_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  test_type TEXT CHECK (test_type IN ('meta_conversion_lift', 'google_ads_lift', 'matched_market')),
  platform TEXT,
  lift_pct NUMERIC(10, 2),
  confidence_lower NUMERIC(10, 2),
  confidence_upper NUMERIC(10, 2),
  is_significant BOOLEAN,
  sample_size INT,
  min_sample_required INT DEFAULT 1000,
  p_value NUMERIC(10, 4),
  test_duration_days INT,
  status TEXT CHECK (status IN ('running', 'significant', 'inconclusive', 'aborted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_incr_client ON incrementality_tests(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incr_status ON incrementality_tests(status);

-- 12. message_match_audits
CREATE TABLE IF NOT EXISTS message_match_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT,
  client_id TEXT NOT NULL,
  ad_creative_id TEXT,
  landing_page_url TEXT NOT NULL,
  match_score INT CHECK (match_score BETWEEN 0 AND 100),
  awareness_stage TEXT CHECK (awareness_stage IN ('unaware', 'aware', 'solution', 'most_aware')),
  objection_gaps JSONB DEFAULT '[]'::jsonb,
  value_prop_defensibility INT CHECK (value_prop_defensibility BETWEEN 0 AND 100),
  mismatch_points INT,
  verdict TEXT CHECK (verdict IN ('pass', 'warn', 'block')),
  editor_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msgmatch_client ON message_match_audits(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msgmatch_verdict ON message_match_audits(verdict, created_at DESC);

-- 13. ad_creative_refreshes — Creative Fatigue refresh audit
CREATE TABLE IF NOT EXISTS ad_creative_refreshes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  fatigue_signals JSONB DEFAULT '{}'::jsonb,
  old_creative_metadata JSONB,
  new_creative_metadata JSONB,
  new_image_urls TEXT[],
  refresh_reason TEXT,
  hitl_approved BOOLEAN DEFAULT NULL,
  deployed BOOLEAN DEFAULT FALSE,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adrefresh_client ON ad_creative_refreshes(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adrefresh_campaign ON ad_creative_refreshes(campaign_id);

-- 14. cro_experiments — CRO Optimizer v2 output
CREATE TABLE IF NOT EXISTS cro_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  hypothesis TEXT,
  ice_impact INT CHECK (ice_impact BETWEEN 1 AND 10),
  ice_confidence INT CHECK (ice_confidence BETWEEN 1 AND 10),
  ice_ease INT CHECK (ice_ease BETWEEN 1 AND 10),
  ice_total INT GENERATED ALWAYS AS (ice_impact * ice_confidence * ice_ease) STORED,
  goodui_principles TEXT[],
  baymard_refs TEXT[],
  mobile_first BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'running', 'completed', 'killed')),
  mde_pct NUMERIC(6, 3),
  sample_size_target INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cro_client_status ON cro_experiments(client_id, status);
CREATE INDEX IF NOT EXISTS idx_cro_ice_total ON cro_experiments(ice_total DESC);

-- 15. ad_performance_snapshots — upgraded Meta Ads v2 output
CREATE TABLE IF NOT EXISTS ad_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  ad_id TEXT,
  snapshot_date DATE NOT NULL,
  tier TEXT CHECK (tier IN ('beta', 'scaling', 'efficient', 'mature')),
  impressions BIGINT,
  clicks INT,
  spend NUMERIC(12, 4),
  conversions INT,
  revenue NUMERIC(12, 4),
  cpa NUMERIC(10, 4),
  roas NUMERIC(10, 4),
  ctr NUMERIC(6, 4),
  cvr NUMERIC(6, 4),
  frequency NUMERIC(6, 4),
  quality_score INT,
  anomaly_flags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_perf_client_date ON ad_performance_snapshots(client_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_perf_campaign ON ad_performance_snapshots(platform, campaign_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_perf_tier ON ad_performance_snapshots(tier);

-- ============================================================
-- RLS — read-only for authenticated users on all Ola 2 tables
-- ============================================================

DO $$
DECLARE t TEXT;
DECLARE tables TEXT[] := ARRAY[
  'rsa_headline_library', 'landing_experiments', 'content_repurposing_queue', 'creative_performance_insights',
  'cannibalization_audits', 'content_refresh_queue', 'backlink_opportunities', 'topical_authority_maps', 'indexation_log',
  'attribution_audits', 'incrementality_tests', 'message_match_audits', 'ad_creative_refreshes', 'cro_experiments', 'ad_performance_snapshots'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'read_all_authenticated'
    ) THEN
      EXECUTE format('CREATE POLICY read_all_authenticated ON %I FOR SELECT TO authenticated USING (true)', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Verification
-- ============================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN (
--   'rsa_headline_library', 'landing_experiments', 'content_repurposing_queue', 'creative_performance_insights',
--   'cannibalization_audits', 'content_refresh_queue', 'backlink_opportunities', 'topical_authority_maps', 'indexation_log',
--   'attribution_audits', 'incrementality_tests', 'message_match_audits', 'ad_creative_refreshes', 'cro_experiments', 'ad_performance_snapshots'
-- )
-- ORDER BY table_name;
-- Expected: 15 rows.
