-- ============================================================
-- ZERO RISK V3 — FEEDBACK LOOP SCHEMA (Pilar 5)
-- Aprendizaje continuo: agent_outcomes → meta_agent → improvements
--
-- Extends the existing agent_outcomes table from client_brain_schema.sql
-- Adds: meta_agent_runs, campaign_results, agent_improvement_proposals
--
-- Run in Supabase SQL Editor AFTER client_brain_schema.sql
-- Idempotent: safe to re-run
-- ============================================================

-- ============================================================
-- Step 1: Extend agent_outcomes with pipeline linkage + cost tracking
-- ============================================================
DO $$
BEGIN
  -- Link outcome to specific pipeline execution
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_outcomes' AND column_name = 'pipeline_id'
  ) THEN
    ALTER TABLE agent_outcomes ADD COLUMN pipeline_id UUID REFERENCES pipeline_executions(id) ON DELETE SET NULL;
  END IF;

  -- Which pipeline step produced this outcome
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_outcomes' AND column_name = 'step_index'
  ) THEN
    ALTER TABLE agent_outcomes ADD COLUMN step_index INTEGER;
  END IF;

  -- Step name for easier querying
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_outcomes' AND column_name = 'step_name'
  ) THEN
    ALTER TABLE agent_outcomes ADD COLUMN step_name TEXT;
  END IF;

  -- Cost tracking per outcome
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_outcomes' AND column_name = 'cost_usd'
  ) THEN
    ALTER TABLE agent_outcomes ADD COLUMN cost_usd NUMERIC(10,4) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_outcomes' AND column_name = 'duration_ms'
  ) THEN
    ALTER TABLE agent_outcomes ADD COLUMN duration_ms INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_outcomes' AND column_name = 'tokens_used'
  ) THEN
    ALTER TABLE agent_outcomes ADD COLUMN tokens_used INTEGER;
  END IF;
END $$;

-- Additional index for pipeline-level queries
CREATE INDEX IF NOT EXISTS idx_outcomes_pipeline ON agent_outcomes(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_step ON agent_outcomes(step_name);
CREATE INDEX IF NOT EXISTS idx_outcomes_created ON agent_outcomes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_unprocessed
  ON agent_outcomes(processed_by_meta_agent)
  WHERE processed_by_meta_agent = false;

-- ============================================================
-- Step 2: campaign_results — Post-publication performance data
-- Fed by Optimization Agent (step 7) after 48h delay
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES pipeline_executions(id) ON DELETE SET NULL,

  -- What was published
  output_id UUID REFERENCES client_historical_outputs(id) ON DELETE SET NULL,
  content_type TEXT,                     -- 'ad_copy', 'social_post', 'email', 'blog', 'landing_page'
  channel TEXT,                          -- 'meta_ads', 'google_ads', 'instagram', 'email', 'website'
  published_url TEXT,
  published_at TIMESTAMPTZ,

  -- Core Metrics
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,           -- Click-through rate (%)
  conversions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(8,4) DEFAULT 0,
  cost_per_click NUMERIC(10,4),
  cost_per_conversion NUMERIC(10,4),
  ad_spend NUMERIC(10,2) DEFAULT 0,

  -- Engagement Metrics
  likes INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  engagement_rate NUMERIC(8,4) DEFAULT 0,

  -- Email-specific
  open_rate NUMERIC(8,4),
  bounce_rate NUMERIC(8,4),
  unsubscribe_rate NUMERIC(8,4),

  -- Revenue attribution
  revenue_attributed NUMERIC(12,2) DEFAULT 0,
  roas NUMERIC(8,2),                    -- Return on Ad Spend

  -- Raw metrics JSONB for platform-specific data
  raw_metrics JSONB DEFAULT '{}',

  -- Analysis
  optimization_notes TEXT,              -- Agent's analysis of what worked/didn't
  performance_grade TEXT                -- 'A', 'B', 'C', 'D', 'F'
    CHECK (performance_grade IS NULL OR performance_grade IN ('A', 'B', 'C', 'D', 'F')),

  -- Tracking
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- When metrics were pulled
  collection_source TEXT,               -- 'meta_api', 'google_analytics', 'mailgun', 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_results_client ON campaign_results(client_id);
CREATE INDEX IF NOT EXISTS idx_campaign_results_pipeline ON campaign_results(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_campaign_results_channel ON campaign_results(channel);
CREATE INDEX IF NOT EXISTS idx_campaign_results_grade ON campaign_results(performance_grade);
CREATE INDEX IF NOT EXISTS idx_campaign_results_date ON campaign_results(published_at DESC);

-- ============================================================
-- Step 3: meta_agent_runs — Each weekly analysis run
-- The meta-agent (Sonnet) processes unprocessed outcomes
-- ============================================================
CREATE TABLE IF NOT EXISTS meta_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Run metadata
  run_type TEXT NOT NULL DEFAULT 'weekly'
    CHECK (run_type IN ('weekly', 'manual', 'triggered')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- Scope
  outcomes_analyzed INTEGER DEFAULT 0,   -- How many agent_outcomes were processed
  outcomes_ids UUID[] DEFAULT '{}',      -- Array of agent_outcome IDs analyzed
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,

  -- Analysis Results
  patterns_detected JSONB DEFAULT '[]',  -- Array of pattern objects
  -- Pattern format:
  -- {
  --   "pattern_id": "P001",
  --   "agent_name": "content-creator",
  --   "pattern_type": "rejection_pattern" | "quality_decline" | "performance_trend" | "cost_anomaly",
  --   "description": "Content-creator's social posts rejected 60% of the time when...",
  --   "confidence": 0.85,
  --   "evidence_count": 5,
  --   "evidence_ids": ["uuid1", "uuid2", ...]
  -- }

  improvements_proposed INTEGER DEFAULT 0,

  -- Cost of the meta-agent run itself
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  duration_ms INTEGER,

  -- Summary for Emilio
  executive_summary TEXT,                -- Human-readable summary for Slack/MC notification

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_runs_status ON meta_agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_meta_runs_date ON meta_agent_runs(created_at DESC);

-- ============================================================
-- Step 4: agent_improvement_proposals — Suggested identity changes
-- NEVER auto-applied — always goes through HITL (Emilio)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_improvement_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_agent_run_id UUID NOT NULL REFERENCES meta_agent_runs(id) ON DELETE CASCADE,

  -- Target agent
  agent_name TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  -- What to change
  proposal_type TEXT NOT NULL
    CHECK (proposal_type IN (
      'identity_update',       -- Change agent's system prompt / identity
      'skill_adjustment',      -- Add/remove/modify a skill
      'model_change',          -- Suggest different model (haiku vs sonnet)
      'workflow_change',       -- Suggest reordering or skipping steps
      'parameter_tuning',      -- Adjust temperature, max_tokens, etc.
      'retirement'             -- Agent is consistently underperforming
    )),

  -- Proposal details
  title TEXT NOT NULL,                   -- Short description: "Improve social post tone"
  rationale TEXT NOT NULL,               -- Why this change: "Agent rejected 60% of time for..."
  current_value TEXT,                    -- Current identity snippet or config
  proposed_value TEXT,                   -- Proposed new value
  expected_impact TEXT,                  -- "Should reduce rejection rate by ~30%"

  -- Evidence
  pattern_id TEXT,                       -- Reference to pattern in meta_agent_runs.patterns_detected
  supporting_outcomes UUID[] DEFAULT '{}', -- agent_outcome IDs that support this proposal
  confidence_score NUMERIC(3,2)          -- 0.00-1.00
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),

  -- HITL Resolution (NON-NEGOTIABLE: always requires human approval)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'deferred', 'applied')),
  reviewed_by TEXT,                      -- 'emilio'
  review_notes TEXT,                     -- Emilio's comments
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,               -- When the change was actually applied

  -- Metadata
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_agent ON agent_improvement_proposals(agent_name);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON agent_improvement_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_run ON agent_improvement_proposals(meta_agent_run_id);
CREATE INDEX IF NOT EXISTS idx_proposals_priority ON agent_improvement_proposals(priority)
  WHERE status = 'pending';

-- ============================================================
-- Step 5: Helper Functions
-- ============================================================

-- Get unprocessed outcomes for meta-agent analysis
CREATE OR REPLACE FUNCTION get_unprocessed_outcomes(
  p_limit INTEGER DEFAULT 100,
  p_since TIMESTAMPTZ DEFAULT (now() - INTERVAL '7 days')
)
RETURNS TABLE (
  id UUID,
  client_id UUID,
  agent_name TEXT,
  task_type TEXT,
  step_name TEXT,
  pipeline_id UUID,
  task_input TEXT,
  output_summary TEXT,
  final_verdict TEXT,
  human_feedback TEXT,
  edited_delta TEXT,
  performance_metrics JSONB,
  cost_usd NUMERIC,
  duration_ms INTEGER,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ao.id, ao.client_id, ao.agent_name, ao.task_type, ao.step_name,
    ao.pipeline_id, ao.task_input, ao.output_summary, ao.final_verdict,
    ao.human_feedback, ao.edited_delta, ao.performance_metrics,
    ao.cost_usd, ao.duration_ms, ao.tokens_used, ao.created_at
  FROM agent_outcomes ao
  WHERE ao.processed_by_meta_agent = false
    AND ao.created_at >= p_since
  ORDER BY ao.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get agent performance summary (for scorecards)
CREATE OR REPLACE FUNCTION get_agent_performance(
  p_agent_name TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT (now() - INTERVAL '30 days')
)
RETURNS TABLE (
  agent_name TEXT,
  total_outcomes BIGINT,
  approved_count BIGINT,
  rejected_count BIGINT,
  edited_count BIGINT,
  escalated_count BIGINT,
  approval_rate NUMERIC,
  avg_cost_usd NUMERIC,
  avg_duration_ms NUMERIC,
  total_tokens BIGINT,
  total_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ao.agent_name,
    COUNT(*)::BIGINT AS total_outcomes,
    COUNT(*) FILTER (WHERE ao.final_verdict = 'approved')::BIGINT,
    COUNT(*) FILTER (WHERE ao.final_verdict = 'rejected')::BIGINT,
    COUNT(*) FILTER (WHERE ao.final_verdict = 'edited')::BIGINT,
    COUNT(*) FILTER (WHERE ao.final_verdict = 'escalated')::BIGINT,
    ROUND(
      (COUNT(*) FILTER (WHERE ao.final_verdict IN ('approved', 'edited'))::NUMERIC /
       NULLIF(COUNT(*), 0)::NUMERIC) * 100, 2
    ) AS approval_rate,
    ROUND(AVG(ao.cost_usd), 4),
    ROUND(AVG(ao.duration_ms)::NUMERIC, 0),
    SUM(ao.tokens_used)::BIGINT,
    SUM(ao.cost_usd)
  FROM agent_outcomes ao
  WHERE ao.created_at >= p_since
    AND (p_agent_name IS NULL OR ao.agent_name = p_agent_name)
  GROUP BY ao.agent_name
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get campaign performance summary
CREATE OR REPLACE FUNCTION get_campaign_performance_summary(
  p_client_id UUID DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT (now() - INTERVAL '30 days')
)
RETURNS TABLE (
  channel TEXT,
  content_type TEXT,
  total_campaigns BIGINT,
  avg_ctr NUMERIC,
  avg_conversion_rate NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT,
  total_conversions BIGINT,
  total_ad_spend NUMERIC,
  total_revenue NUMERIC,
  avg_roas NUMERIC,
  avg_grade TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.channel,
    cr.content_type,
    COUNT(*)::BIGINT,
    ROUND(AVG(cr.ctr), 4),
    ROUND(AVG(cr.conversion_rate), 4),
    SUM(cr.impressions)::BIGINT,
    SUM(cr.clicks)::BIGINT,
    SUM(cr.conversions)::BIGINT,
    SUM(cr.ad_spend),
    SUM(cr.revenue_attributed),
    ROUND(AVG(cr.roas), 2),
    MODE() WITHIN GROUP (ORDER BY cr.performance_grade)
  FROM campaign_results cr
  WHERE cr.collected_at >= p_since
    AND (p_client_id IS NULL OR cr.client_id = p_client_id)
  GROUP BY cr.channel, cr.content_type
  ORDER BY SUM(cr.impressions) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Mark outcomes as processed by a meta-agent run
CREATE OR REPLACE FUNCTION mark_outcomes_processed(
  p_outcome_ids UUID[],
  p_meta_agent_run_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE agent_outcomes
  SET processed_by_meta_agent = true,
      meta_agent_run_id = p_meta_agent_run_id
  WHERE id = ANY(p_outcome_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 6: Views for dashboards and reporting
-- ============================================================

-- Agent scorecard view (live performance dashboard)
CREATE OR REPLACE VIEW v_agent_scorecards AS
SELECT
  ao.agent_name,
  COUNT(*) AS total_tasks,
  COUNT(*) FILTER (WHERE ao.final_verdict = 'approved') AS approved,
  COUNT(*) FILTER (WHERE ao.final_verdict = 'rejected') AS rejected,
  COUNT(*) FILTER (WHERE ao.final_verdict = 'edited') AS edited,
  ROUND(
    (COUNT(*) FILTER (WHERE ao.final_verdict IN ('approved', 'edited'))::NUMERIC /
     NULLIF(COUNT(*), 0)::NUMERIC) * 100, 1
  ) AS approval_rate_pct,
  ROUND(AVG(ao.cost_usd), 4) AS avg_cost,
  ROUND(AVG(ao.duration_ms)::NUMERIC / 1000, 1) AS avg_duration_sec,
  SUM(ao.cost_usd) AS total_cost,
  MAX(ao.created_at) AS last_activity
FROM agent_outcomes ao
WHERE ao.created_at >= (now() - INTERVAL '30 days')
GROUP BY ao.agent_name
ORDER BY COUNT(*) DESC;

-- Pending improvements view (for Mission Control inbox)
CREATE OR REPLACE VIEW v_pending_improvements AS
SELECT
  aip.id,
  aip.agent_name,
  aip.proposal_type,
  aip.title,
  aip.rationale,
  aip.expected_impact,
  aip.confidence_score,
  aip.priority,
  aip.status,
  mar.executive_summary AS run_summary,
  aip.created_at
FROM agent_improvement_proposals aip
JOIN meta_agent_runs mar ON mar.id = aip.meta_agent_run_id
WHERE aip.status = 'pending'
ORDER BY
  CASE aip.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  aip.confidence_score DESC;

-- ============================================================
-- Step 7: RLS Policies (single-tenant, full access)
-- ============================================================
ALTER TABLE campaign_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_improvement_proposals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'campaign_results',
    'meta_agent_runs',
    'agent_improvement_proposals'
  ]) LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "auth_full_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t, t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Also allow service_role full access (for API routes)
    BEGIN
      EXECUTE format(
        'CREATE POLICY "service_full_%s" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t, t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Also add service_role policies on existing agent_outcomes table
DO $$
BEGIN
  CREATE POLICY "service_full_agent_outcomes" ON agent_outcomes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Step 8: Trigger for updated_at on campaign_results
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_results_updated ON campaign_results;
CREATE TRIGGER trg_campaign_results_updated
  BEFORE UPDATE ON campaign_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SUMMARY
-- ============================================================
-- Tables created/modified:
--   1. agent_outcomes (ALTERED: +pipeline_id, +step_index, +step_name, +cost_usd, +duration_ms, +tokens_used)
--   2. campaign_results (NEW: post-publication performance data)
--   3. meta_agent_runs (NEW: weekly analysis tracking)
--   4. agent_improvement_proposals (NEW: HITL-gated identity improvements)
--
-- Functions created:
--   - get_unprocessed_outcomes(): Fetch outcomes for meta-agent processing
--   - get_agent_performance(): Agent scorecard data
--   - get_campaign_performance_summary(): Campaign results aggregation
--   - mark_outcomes_processed(): Batch mark outcomes as analyzed
--
-- Views created:
--   - v_agent_scorecards: Live agent performance dashboard
--   - v_pending_improvements: Pending proposals for Mission Control
--
-- CRITICAL: Meta-agent NEVER applies changes directly.
-- All proposals go through HITL (Emilio approval via MC inbox or Slack).
-- ============================================================
