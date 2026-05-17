-- Sprint #7 Brazo 3 baseline · meta_ads_* persistence layer
--
-- Three tables backing the Meta Ads pipeline:
--   1) meta_ads_campaigns       · 1-row-per-campaign mirror of Graph API
--   2) meta_ads_insights_daily  · time-series snapshot · ad-level per day
--   3) meta_ads_creatives       · creative variants + FK back to agent_image_generations
--
-- Pattern · mirrors agent_3d_generations / agent_image_generations · client_id TEXT
-- (soft link · resolver Fix 8b/8c chain compatible) · RLS service_role only · idempotent.
--
-- Build-only · NO smoke until Meta Ad Account billing is restored.

-- ============================================================================
-- 1 · meta_ads_campaigns
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta_ads_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     TEXT NOT NULL UNIQUE,
  client_id       TEXT,
  name            TEXT NOT NULL,
  objective       TEXT NOT NULL
                  CHECK (objective IN (
                    'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT',
                    'OUTCOME_LEADS', 'OUTCOME_APP_PROMOTION', 'OUTCOME_SALES'
                  )),
  status          TEXT NOT NULL DEFAULT 'PAUSED'
                  CHECK (status IN ('ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED')),
  effective_status TEXT,
  daily_budget    NUMERIC(12, 2),
  lifetime_budget NUMERIC(12, 2),
  special_ad_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  buying_type     TEXT DEFAULT 'AUCTION',
  ad_account_id   TEXT,
  caller          TEXT,
  raw_response    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta_created_time TIMESTAMPTZ,
  meta_updated_time TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_campaigns_client_created
  ON meta_ads_campaigns (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_ads_campaigns_status
  ON meta_ads_campaigns (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_ads_campaigns_objective
  ON meta_ads_campaigns (objective, client_id);

ALTER TABLE meta_ads_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_ads_campaigns_service_role_all"
  ON meta_ads_campaigns;

CREATE POLICY "meta_ads_campaigns_service_role_all"
  ON meta_ads_campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE meta_ads_campaigns IS
  'Meta Ads campaigns · 1 row per Graph API campaign_id. '
  'Caller: POST /api/meta-ads/campaigns/create. Status defaults PAUSED (HITL gate before ACTIVE).';

-- ============================================================================
-- 2 · meta_ads_insights_daily
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta_ads_insights_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT,
  campaign_id     TEXT,
  adset_id        TEXT,
  ad_id           TEXT,
  snapshot_date   DATE NOT NULL,
  impressions     INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  spend           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ctr             NUMERIC(8, 4) NOT NULL DEFAULT 0,
  cpc             NUMERIC(10, 4) NOT NULL DEFAULT 0,
  cpa             NUMERIC(10, 4) NOT NULL DEFAULT 0,
  reach           INTEGER NOT NULL DEFAULT 0,
  frequency       NUMERIC(8, 4) NOT NULL DEFAULT 0,
  leads           INTEGER NOT NULL DEFAULT 0,
  purchases       INTEGER NOT NULL DEFAULT 0,
  revenue         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  roas            NUMERIC(8, 4),
  raw_actions     JSONB,
  source          TEXT NOT NULL DEFAULT 'meta_graph_v21_insights',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_client_date
  ON meta_ads_insights_daily (client_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_campaign_date
  ON meta_ads_insights_daily (campaign_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_adset_date
  ON meta_ads_insights_daily (adset_id, snapshot_date DESC)
  WHERE adset_id IS NOT NULL;

ALTER TABLE meta_ads_insights_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_ads_insights_daily_service_role_all"
  ON meta_ads_insights_daily;

CREATE POLICY "meta_ads_insights_daily_service_role_all"
  ON meta_ads_insights_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE meta_ads_insights_daily IS
  'Meta Ads time-series insights · 1 row per ad_id per snapshot_date. '
  'Caller: POST /api/meta-ads/insights/sync (n8n daily cron). UNIQUE constraint enables idempotent UPSERT.';

-- ============================================================================
-- 3 · meta_ads_creatives
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta_ads_creatives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id     TEXT NOT NULL UNIQUE,
  client_id       TEXT,
  campaign_id     TEXT,
  variant_id      TEXT,
  name            TEXT,
  title           TEXT,
  body            TEXT,
  call_to_action  TEXT,
  link_url        TEXT,
  image_hash      TEXT,
  image_url       TEXT,
  thumbnail_url   TEXT,
  agent_image_generation_id UUID
                  REFERENCES agent_image_generations(id) ON DELETE SET NULL,
  format          TEXT
                  CHECK (format IN ('single_image', 'carousel', 'video', 'collection', 'instant_experience')),
  raw_response    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_creatives_client_created
  ON meta_ads_creatives (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_ads_creatives_campaign
  ON meta_ads_creatives (campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_ads_creatives_variant
  ON meta_ads_creatives (variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_ads_creatives_image_hash
  ON meta_ads_creatives (image_hash)
  WHERE image_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_ads_creatives_agent_image
  ON meta_ads_creatives (agent_image_generation_id)
  WHERE agent_image_generation_id IS NOT NULL;

ALTER TABLE meta_ads_creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_ads_creatives_service_role_all"
  ON meta_ads_creatives;

CREATE POLICY "meta_ads_creatives_service_role_all"
  ON meta_ads_creatives
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE meta_ads_creatives IS
  'Meta Ads creatives · 1 row per Graph API creative_id. '
  'FK agent_image_generation_id bridges to GPT-Image-1.5 source artifact.';
