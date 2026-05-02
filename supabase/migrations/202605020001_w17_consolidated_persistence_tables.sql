-- ============================================================================
-- Migration: 202605020001_w17_consolidated_persistence_tables
-- Purpose: Resolve fallback_mode in 6 W16 endpoints by creating their backing
--          persistence tables with multi-tenant indexes + RLS policies.
--
--          Once this migration runs against Supabase, the following endpoints
--          stop returning {fallback_mode: true, persisted_id: null} and start
--          returning {ok: true, persisted_id: <uuid>}:
--
--            POST /api/churn-predictions          → churn_predictions
--            POST /api/community-health/upsert    → community_health_snapshots
--            POST /api/expansion-opportunities    → expansion_opportunities
--            POST /api/insights/store             → agent_insights
--            POST /api/rfm-segments/upsert        → rfm_segments
--            POST /api/surveys/nps/log-sent       → nps_dispatch_log
--
-- Author: CC#2 · Wave 17 · T1 (MIG-1 from CC2_W16_FINDINGS.md §5)
-- Idempotent: yes · safe to re-run · all CREATE statements use IF NOT EXISTS
-- Rollback: see bottom of file (commented; uncomment to revert one table)
-- Pre-req: assumes `clients(id uuid)` exists (it does · client_brain_schema.sql)
-- Note: NOT yet applied against Supabase prod — pending Pro upgrade 5-may
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. churn_predictions  (W15-D-07 · ML output of Churn Prediction 90d cron)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS churn_predictions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               TEXT NOT NULL,
  predicted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  churn_probability       NUMERIC(4,3) NOT NULL CHECK (churn_probability >= 0 AND churn_probability <= 1),
  prediction_window_days  INTEGER NOT NULL DEFAULT 90 CHECK (prediction_window_days BETWEEN 1 AND 365),
  confidence              NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  top_factors             TEXT[] DEFAULT ARRAY[]::TEXT[],
  model_version           TEXT,
  context                 JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_predictions_client_predicted
  ON churn_predictions (client_id, predicted_at DESC);

CREATE INDEX IF NOT EXISTS idx_churn_predictions_high_risk
  ON churn_predictions (predicted_at DESC)
  WHERE churn_probability >= 0.7;

COMMENT ON TABLE churn_predictions IS
  'ML-generated churn-risk predictions. Caller: `Zero Risk - Churn Prediction 90d Pre-Renewal (9am)`. Closes W15-D-07. Backs POST /api/churn-predictions.';

-- ----------------------------------------------------------------------------
-- 2. community_health_snapshots  (W15-D-08 · Daily community vitals)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_health_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                TEXT NOT NULL,
  snapshot_date            DATE NOT NULL,
  platform                 TEXT NOT NULL DEFAULT 'all',
  health_score             NUMERIC(5,2) CHECK (health_score IS NULL OR (health_score >= 0 AND health_score <= 100)),
  active_members_24h       INTEGER CHECK (active_members_24h IS NULL OR active_members_24h >= 0),
  new_members_24h          INTEGER CHECK (new_members_24h IS NULL OR new_members_24h >= 0),
  posts_24h                INTEGER CHECK (posts_24h IS NULL OR posts_24h >= 0),
  engagement_rate_24h      NUMERIC(4,3) CHECK (engagement_rate_24h IS NULL OR (engagement_rate_24h >= 0 AND engagement_rate_24h <= 1)),
  sentiment_score          NUMERIC(4,3) CHECK (sentiment_score IS NULL OR (sentiment_score >= -1 AND sentiment_score <= 1)),
  alerts                   TEXT[] DEFAULT ARRAY[]::TEXT[],
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_community_health_client_date_platform UNIQUE (client_id, snapshot_date, platform)
);

CREATE INDEX IF NOT EXISTS idx_community_health_client_date
  ON community_health_snapshots (client_id, snapshot_date DESC);

COMMENT ON TABLE community_health_snapshots IS
  'Daily community-vitals rollup. Caller: `Zero Risk - Community Health Daily (8am)`. Closes W15-D-08. Backs POST /api/community-health/upsert. Idempotent on (client_id, snapshot_date, platform).';

-- ----------------------------------------------------------------------------
-- 3. expansion_opportunities  (W15-D-10 · Friday Scanner output)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expansion_opportunities (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                TEXT NOT NULL,
  opportunity_type         TEXT NOT NULL CHECK (opportunity_type IN (
    'upsell', 'cross_sell', 'renewal_extension',
    'seat_expansion', 'feature_unlock', 'service_addon'
  )),
  score                    NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  estimated_value_usd      NUMERIC(12,2) CHECK (estimated_value_usd IS NULL OR estimated_value_usd >= 0),
  confidence               NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence                 TEXT[] DEFAULT ARRAY[]::TEXT[],
  next_action              TEXT,
  owner_role               TEXT,
  expires_at               TIMESTAMPTZ,
  detected_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expansion_opportunities_client_detected
  ON expansion_opportunities (client_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_expansion_opportunities_high_score
  ON expansion_opportunities (detected_at DESC)
  WHERE score >= 70;

COMMENT ON TABLE expansion_opportunities IS
  'Scored upsell/cross-sell opportunities. Caller: `Zero Risk - Expansion Readiness Scanner (Friday 2pm)`. Closes W15-D-10. Backs POST /api/expansion-opportunities.';

-- ----------------------------------------------------------------------------
-- 4. agent_insights  (W15-D-19 · Generic insight store)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_insights (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                TEXT,
  insight_type             TEXT NOT NULL,
  payload                  JSONB NOT NULL,
  source                   TEXT,
  confidence               NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence                 TEXT[] DEFAULT ARRAY[]::TEXT[],
  agent_slug               TEXT,
  request_id               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_insights_type_created
  ON agent_insights (insight_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_insights_client_created
  ON agent_insights (client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_insights_agent_created
  ON agent_insights (agent_slug, created_at DESC)
  WHERE agent_slug IS NOT NULL;

COMMENT ON TABLE agent_insights IS
  'Generic insight store fed by ML loops (creative-learner, attribution-validator, others). Caller: `Zero Risk - Creative Performance Learner`. Closes W15-D-19. Backs POST /api/insights/store.';

-- ----------------------------------------------------------------------------
-- 5. rfm_segments  (W15-D-25 · Nightly RFM bucket assignments)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rfm_segments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                TEXT NOT NULL,
  contact_id               TEXT NOT NULL,
  segment                  TEXT NOT NULL CHECK (segment IN (
    'champions', 'loyal', 'potential_loyalists', 'new_customers', 'promising',
    'need_attention', 'about_to_sleep', 'at_risk', 'cant_lose_them',
    'hibernating', 'lost'
  )),
  recency_days             INTEGER CHECK (recency_days IS NULL OR recency_days >= 0),
  frequency_30d            INTEGER CHECK (frequency_30d IS NULL OR frequency_30d >= 0),
  monetary_lifetime_usd    NUMERIC(12,2) CHECK (monetary_lifetime_usd IS NULL OR monetary_lifetime_usd >= 0),
  rfm_score                TEXT,
  previous_segment         TEXT,
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rfm_segments_client_contact UNIQUE (client_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_rfm_segments_client_segment
  ON rfm_segments (client_id, segment);

CREATE INDEX IF NOT EXISTS idx_rfm_segments_at_risk
  ON rfm_segments (client_id, computed_at DESC)
  WHERE segment IN ('at_risk', 'cant_lose_them', 'about_to_sleep');

COMMENT ON TABLE rfm_segments IS
  'Per-contact RFM bucket assignments. Caller: `Zero Risk - RFM Segmentation Nightly (2am)`. Closes W15-D-25. Backs POST /api/rfm-segments/upsert. Idempotent on (client_id, contact_id).';

-- ----------------------------------------------------------------------------
-- 6. nps_dispatch_log  (W15-D-28 · NPS survey send log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nps_dispatch_log (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                TEXT NOT NULL,
  contact_id               TEXT NOT NULL,
  survey_id                TEXT NOT NULL,
  channel                  TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'in_app', 'whatsapp')),
  template_id              TEXT,
  personalization          JSONB,
  expires_at               TIMESTAMPTZ,
  sent_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nps_dispatch_client_sent
  ON nps_dispatch_log (client_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_nps_dispatch_survey_contact
  ON nps_dispatch_log (survey_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_nps_dispatch_pending_response
  ON nps_dispatch_log (sent_at DESC)
  WHERE responded_at IS NULL;

COMMENT ON TABLE nps_dispatch_log IS
  'NPS survey dispatch log for response-latency / channel-A/B analytics. Caller: `Zero Risk - NPS + CSAT Monthly Pulse (1st 10am)`. Closes W15-D-28. Backs POST /api/surveys/nps/log-sent.';

-- ============================================================================
-- Row-Level Security · authenticated full CRUD per W13 RLS pattern
--
-- All 6 tables flip RLS ON. The internal API key path uses the service-role
-- key which bypasses RLS, so n8n workflows are unaffected. Authenticated
-- Mission Control users get full CRUD via the same DO-block template used in
-- sql/client_brain_schema.sql so the dashboard can display these rows.
--
-- DROP POLICY IF EXISTS guard makes the migration safe to re-run after schema
-- changes (CREATE POLICY does not support IF NOT EXISTS in all PG versions).
-- ============================================================================
ALTER TABLE churn_predictions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE expansion_opportunities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_insights             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfm_segments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_dispatch_log           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'churn_predictions',
    'community_health_snapshots',
    'expansion_opportunities',
    'agent_insights',
    'rfm_segments',
    'nps_dispatch_log'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_full_%s" ON %I;', t, t);
    EXECUTE format('
      CREATE POLICY "auth_full_%s" ON %I
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true);
    ', t, t);
  END LOOP;
END;
$$;

-- ============================================================================
-- updated_at triggers · only on tables that have an updated_at column
-- ============================================================================
CREATE OR REPLACE FUNCTION w17_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'community_health_snapshots',
    'rfm_segments'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;', t, t);
    EXECUTE format('
      CREATE TRIGGER trg_%s_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION w17_touch_updated_at();
    ', t, t);
  END LOOP;
END;
$$;

-- ============================================================================
-- Rollback (commented · uncomment per table to revert)
-- ----------------------------------------------------------------------------
-- DROP TABLE IF EXISTS churn_predictions          CASCADE;
-- DROP TABLE IF EXISTS community_health_snapshots CASCADE;
-- DROP TABLE IF EXISTS expansion_opportunities    CASCADE;
-- DROP TABLE IF EXISTS agent_insights             CASCADE;
-- DROP TABLE IF EXISTS rfm_segments               CASCADE;
-- DROP TABLE IF EXISTS nps_dispatch_log           CASCADE;
-- DROP FUNCTION IF EXISTS w17_touch_updated_at();
-- ============================================================================
