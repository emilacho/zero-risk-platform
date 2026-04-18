-- Zero Risk — Cluster 1 (Orchestration & Meta-Learning) tables
-- Session 27b / Ola 1
--
-- Run this in Supabase SQL Editor BEFORE importing the 6 Cluster-1 n8n workflows.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.

-- ============================================================
-- 1. campaign_pipeline_state
-- ============================================================
-- NEXUS 7-Phase Orchestrator writes phase state per campaign.
-- Each row = one campaign execution through the 7 phases.

CREATE TABLE IF NOT EXISTS campaign_pipeline_state (
  request_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  current_phase TEXT NOT NULL CHECK (current_phase IN (
    'DISCOVER', 'STRATEGIZE', 'SCAFFOLD', 'BUILD', 'HARDEN', 'LAUNCH', 'OPERATE', 'DONE', 'FAILED'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'retrying', 'blocked_hitl', 'completed', 'failed'
  )),
  retry_count INT NOT NULL DEFAULT 0,
  phase_outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_client ON campaign_pipeline_state(client_id);
CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_status ON campaign_pipeline_state(status);
CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_updated ON campaign_pipeline_state(updated_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_pipeline_updated_at ON campaign_pipeline_state;
CREATE TRIGGER trg_campaign_pipeline_updated_at
  BEFORE UPDATE ON campaign_pipeline_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. agent_routing_log
-- ============================================================
-- RUFLO Smart Router writes every classification decision for post-hoc analysis.

CREATE TABLE IF NOT EXISTS agent_routing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  client_id TEXT,
  original_request TEXT NOT NULL,
  classification_type TEXT NOT NULL CHECK (classification_type IN (
    'depth-first', 'breadth-first', 'straightforward'
  )),
  assigned_agents JSONB NOT NULL DEFAULT '[]'::jsonb,
  complexity TEXT CHECK (complexity IN ('low', 'medium', 'high', 'critical')),
  confidence NUMERIC(3, 2),
  status TEXT NOT NULL DEFAULT 'routed' CHECK (status IN (
    'routed', 'completed', 'failed', 'escalated_to_hitl'
  )),
  routed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_routing_request ON agent_routing_log(request_id);
CREATE INDEX IF NOT EXISTS idx_agent_routing_client ON agent_routing_log(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_routing_routed_at ON agent_routing_log(routed_at DESC);

-- ============================================================
-- 3. identity_improvement_queue
-- ============================================================
-- Meta-Agent Weekly Learning Cycle queues identity improvement proposals.
-- Emilio reviews manually and approves/rejects.

CREATE TABLE IF NOT EXISTS identity_improvement_queue (
  proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug TEXT NOT NULL,
  improvement_rationale TEXT NOT NULL,
  expected_impact TEXT,
  proposed_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  supporting_data JSONB DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  proposed_by TEXT NOT NULL DEFAULT 'meta-agent',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'applied', 'reverted'
  )),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_improv_status ON identity_improvement_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_identity_improv_agent ON identity_improvement_queue(agent_slug);

-- ============================================================
-- 4. phase_gate_audits
-- ============================================================
-- Phase Gate Evidence Collector writes one audit row per phase transition attempt.

CREATE TABLE IF NOT EXISTS phase_gate_audits (
  validation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('PASS', 'RETRY', 'FAIL')),
  structural_issues JSONB DEFAULT '[]'::jsonb,
  semantic_issues JSONB DEFAULT '[]'::jsonb,
  rationale TEXT,
  editor_review JSONB DEFAULT '{}'::jsonb,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase_gate_request ON phase_gate_audits(request_id);
CREATE INDEX IF NOT EXISTS idx_phase_gate_verdict ON phase_gate_audits(verdict, validated_at DESC);

-- ============================================================
-- 5. hitl_cycle_metrics
-- ============================================================
-- HITL Inbox Processor writes one metrics row per 15-min cycle for trending.

CREATE TABLE IF NOT EXISTS hitl_cycle_metrics (
  cycle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_depth INT NOT NULL DEFAULT 0,
  items_renotified INT NOT NULL DEFAULT 0,
  items_expired INT NOT NULL DEFAULT 0,
  items_escalated INT NOT NULL DEFAULT 0,
  cycle_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hitl_cycle_timestamp ON hitl_cycle_metrics(cycle_timestamp DESC);

-- ============================================================
-- 6. hitl_pending_approvals (assumed existing; include IF NOT EXISTS)
-- ============================================================
-- Queue of items awaiting human approval. Written by any workflow that
-- hits a HITL gate; read + updated by HITL Inbox Processor + humans.

CREATE TABLE IF NOT EXISTS hitl_pending_approvals (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type TEXT NOT NULL,
  required_approver TEXT NOT NULL DEFAULT 'emilio',
  escalation_path TEXT,
  request_id TEXT,
  client_id TEXT,
  phase TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'notified', 'approved', 'rejected', 'expired', 'escalated'
  )),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours')
);

CREATE INDEX IF NOT EXISTS idx_hitl_pending_status ON hitl_pending_approvals(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_hitl_pending_approver ON hitl_pending_approvals(required_approver, status);

-- ============================================================
-- 7. agent_outcomes (assumed existing from Pilar 5; include IF NOT EXISTS)
-- ============================================================
-- Fire-and-forget outcomes stream from every /api/agents/run completion.
-- Feeds Meta-Agent Weekly Learning Cycle.

CREATE TABLE IF NOT EXISTS agent_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug TEXT NOT NULL,
  task_id TEXT,
  request_id TEXT,
  client_id TEXT,
  input JSONB,
  output JSONB,
  tokens_used INT,
  input_tokens INT,
  output_tokens INT,
  latency_ms INT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error TEXT,
  model TEXT,
  cost_usd NUMERIC(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_outcomes_agent ON agent_outcomes(agent_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_outcomes_request ON agent_outcomes(request_id);
CREATE INDEX IF NOT EXISTS idx_agent_outcomes_success ON agent_outcomes(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_outcomes_created ON agent_outcomes(created_at DESC);

-- ============================================================
-- 8. performance_metrics (assumed existing from Pilar 5; include IF NOT EXISTS)
-- ============================================================
-- Real-world campaign performance (CTR, CPA, ROAS, etc) keyed by pipeline/campaign.

CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug TEXT,
  client_id TEXT,
  pipeline_id TEXT,
  campaign_id TEXT,
  metric_name TEXT NOT NULL,
  value NUMERIC,
  value_json JSONB,
  unit TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_perf_metrics_agent ON performance_metrics(agent_slug, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_client ON performance_metrics(client_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_metric ON performance_metrics(metric_name, timestamp DESC);

-- ============================================================
-- RLS — disable for service-role writes (all API routes use service key)
-- ============================================================
-- These tables are written exclusively by backend API routes using SUPABASE_SERVICE_ROLE_KEY
-- which bypasses RLS. For client-side read access via anon key, add explicit policies.

ALTER TABLE campaign_pipeline_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_routing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_improvement_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_gate_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hitl_cycle_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE hitl_pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

-- Read-only policy for authenticated users (so Mission Control dashboard can read)
-- Service role always bypasses RLS; these policies only apply to anon/authenticated.
DO $$
BEGIN
  -- campaign_pipeline_state
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'campaign_pipeline_state' AND policyname = 'read_all_authenticated'
  ) THEN
    CREATE POLICY read_all_authenticated ON campaign_pipeline_state FOR SELECT TO authenticated USING (true);
  END IF;
  -- agent_routing_log
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_routing_log' AND policyname = 'read_all_authenticated'
  ) THEN
    CREATE POLICY read_all_authenticated ON agent_routing_log FOR SELECT TO authenticated USING (true);
  END IF;
  -- identity_improvement_queue
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'identity_improvement_queue' AND policyname = 'read_all_authenticated'
  ) THEN
    CREATE POLICY read_all_authenticated ON identity_improvement_queue FOR SELECT TO authenticated USING (true);
  END IF;
  -- phase_gate_audits
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'phase_gate_audits' AND policyname = 'read_all_authenticated'
  ) THEN
    CREATE POLICY read_all_authenticated ON phase_gate_audits FOR SELECT TO authenticated USING (true);
  END IF;
  -- hitl_cycle_metrics
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hitl_cycle_metrics' AND policyname = 'read_all_authenticated'
  ) THEN
    CREATE POLICY read_all_authenticated ON hitl_cycle_metrics FOR SELECT TO authenticated USING (true);
  END IF;
  -- hitl_pending_approvals
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hitl_pending_approvals' AND policyname = 'read_all_authenticated'
  ) THEN
    CREATE POLICY read_all_authenticated ON hitl_pending_approvals FOR SELECT TO authenticated USING (true);
  END IF;
  -- agent_outcomes
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_outcomes' AND policyname = 'read_all_authenticated'
  ) THEN
    CREATE POLICY read_all_authenticated ON agent_outcomes FOR SELECT TO authenticated USING (true);
  END IF;
  -- performance_metrics
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'performance_metrics' AND policyname = 'read_all_authenticated'
  ) THEN
    CREATE POLICY read_all_authenticated ON performance_metrics FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================
-- Verification queries (run after migration)
-- ============================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN (
--   'campaign_pipeline_state', 'agent_routing_log', 'identity_improvement_queue',
--   'phase_gate_audits', 'hitl_cycle_metrics', 'hitl_pending_approvals',
--   'agent_outcomes', 'performance_metrics'
-- )
-- ORDER BY table_name;
-- Expected: 8 rows.
