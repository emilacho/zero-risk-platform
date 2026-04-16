-- ============================================================
-- ZERO RISK V3 — Pipeline Execution Schema
-- Pilar 3: Workflows Recableados + Pipeline de 9 Pasos
-- Created: 2026-04-11 (Session 16)
-- ============================================================

-- Pipeline Executions: una fila por pipeline completa lanzada
CREATE TABLE IF NOT EXISTS pipeline_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,

  -- What triggered this pipeline
  trigger_type text NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'webhook', 'n8n')),
  trigger_source text, -- e.g. "Mission Control", "n8n cron", "Slack command"

  -- The original objective
  objective text NOT NULL, -- e.g. "Lanzar campaña de lead generation con 5 posts social + newsletter"

  -- Pipeline config
  pipeline_template text NOT NULL DEFAULT 'campaign_full_9step',
  steps_config jsonb NOT NULL DEFAULT '[]'::jsonb, -- ordered list of step definitions

  -- State
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- created but not started
    'running',      -- actively executing steps
    'paused_hitl',  -- waiting for human approval
    'completed',    -- all steps finished successfully
    'failed',       -- a step failed and pipeline stopped
    'cancelled'     -- manually cancelled
  )),
  current_step_index int NOT NULL DEFAULT 0,

  -- Timing
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,

  -- Cost tracking
  total_input_tokens int NOT NULL DEFAULT 0,
  total_output_tokens int NOT NULL DEFAULT 0,
  total_cost_usd numeric(10,4) NOT NULL DEFAULT 0,

  -- Metadata
  created_by text DEFAULT 'system', -- 'emilio', 'n8n', 'api'
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pipeline Steps: una fila por paso ejecutado
CREATE TABLE IF NOT EXISTS pipeline_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES pipeline_executions(id) ON DELETE CASCADE,

  -- Step definition
  step_index int NOT NULL, -- 0-8 for the 9-step pipeline
  step_name text NOT NULL, -- e.g. 'competitive_intel', 'campaign_brief', etc.
  step_display_name text NOT NULL, -- e.g. 'Competitive Intelligence', 'Campaign Brief'
  agent_name text, -- FK-like reference to agents.name (nullable for HITL steps)

  -- Execution
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'running',
    'completed',
    'failed',
    'skipped',
    'paused_hitl'
  )),

  -- Input/Output
  input_context jsonb DEFAULT '{}'::jsonb,  -- what was sent to the agent
  output_result jsonb DEFAULT '{}'::jsonb,  -- what the agent produced
  output_text text,                         -- main text output (for chaining)

  -- HITL specific
  hitl_required boolean NOT NULL DEFAULT false,
  hitl_status text CHECK (hitl_status IN ('pending', 'approved', 'rejected', 'edited')),
  hitl_reviewer text, -- who reviewed (e.g. 'emilio')
  hitl_feedback text, -- reviewer comments
  hitl_resolved_at timestamptz,

  -- Tokens & cost
  input_tokens int DEFAULT 0,
  output_tokens int DEFAULT 0,
  cost_usd numeric(10,4) DEFAULT 0,

  -- Timing
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,

  -- Error handling
  error_message text,
  retry_count int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 2,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(pipeline_id, step_index)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pipeline_executions_status ON pipeline_executions(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_executions_client ON pipeline_executions(client_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_pipeline ON pipeline_steps(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_status ON pipeline_steps(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_hitl ON pipeline_steps(hitl_required, hitl_status) WHERE hitl_required = true;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pipeline_executions_updated_at') THEN
    CREATE TRIGGER trg_pipeline_executions_updated_at
      BEFORE UPDATE ON pipeline_executions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pipeline_steps_updated_at') THEN
    CREATE TRIGGER trg_pipeline_steps_updated_at
      BEFORE UPDATE ON pipeline_steps
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

-- ============================================================
-- PIPELINE TEMPLATES
-- ============================================================
-- The default 9-step campaign pipeline template as a function
-- Returns the step definitions that get stored in steps_config

CREATE OR REPLACE FUNCTION get_pipeline_template(template_name text DEFAULT 'campaign_full_9step')
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF template_name = 'campaign_full_9step' THEN
    RETURN '[
      {
        "index": 0,
        "name": "competitive_intel",
        "display_name": "Competitive Intelligence",
        "agent": "competitive_intelligence_agent",
        "description": "5-layer competitive analysis: ads, landing pages, SEO gaps, social listening, trends",
        "hitl_required": false,
        "depends_on": [],
        "timeout_minutes": 30
      },
      {
        "index": 1,
        "name": "campaign_brief",
        "display_name": "Campaign Brief",
        "agent": "campaign-brief-agent",
        "description": "Structured brief from intel + Client Brain: target audience, key messages, channels, deliverables, KPIs",
        "hitl_required": false,
        "depends_on": [0],
        "timeout_minutes": 15
      },
      {
        "index": 2,
        "name": "jefe_marketing_review",
        "display_name": "Jefe de Marketing Review",
        "agent": "jefe-marketing",
        "description": "Decompose brief into subtasks, assign to specialist agents, set quality criteria",
        "hitl_required": false,
        "depends_on": [1],
        "timeout_minutes": 15
      },
      {
        "index": 3,
        "name": "content_creation",
        "display_name": "Content Creation",
        "agent": null,
        "description": "Specialist agents execute subtasks in parallel (content, design, ads, email, etc.)",
        "hitl_required": false,
        "depends_on": [2],
        "timeout_minutes": 60,
        "is_parallel": true,
        "sub_agents": ["content-creator", "seo-specialist", "media-buyer", "email-marketer", "social-media-strategist", "web_designer", "video_editor_motion_designer"]
      },
      {
        "index": 4,
        "name": "qa_review",
        "display_name": "QA Review (Editor en Jefe)",
        "agent": "editor_en_jefe",
        "description": "Quality gate: brand voice, accuracy, forbidden words, format compliance. Verdicts: APPROVED / REVISION / REJECTED",
        "hitl_required": false,
        "depends_on": [3],
        "timeout_minutes": 15
      },
      {
        "index": 5,
        "name": "hitl_review",
        "display_name": "Human Review (HITL)",
        "agent": null,
        "description": "Human approval via Mission Control inbox or Slack. Pipeline pauses until resolved.",
        "hitl_required": true,
        "depends_on": [4],
        "timeout_minutes": null
      },
      {
        "index": 6,
        "name": "publication",
        "display_name": "Publication",
        "agent": null,
        "description": "Publish approved content via platform APIs (Meta Ads, Mailgun, GoHighLevel, social)",
        "hitl_required": false,
        "depends_on": [5],
        "timeout_minutes": 30,
        "is_n8n": true,
        "n8n_workflow": "publish_content.json"
      },
      {
        "index": 7,
        "name": "optimization",
        "display_name": "Optimization",
        "agent": "optimization-agent",
        "description": "Analyze performance metrics post-publication, propose iterations with data",
        "hitl_required": false,
        "depends_on": [6],
        "timeout_minutes": 15,
        "delay_hours": 48
      },
      {
        "index": 8,
        "name": "reporting",
        "display_name": "Reporting",
        "agent": "reporting_agent",
        "description": "Generate client-facing report with results, insights, and next steps",
        "hitl_required": true,
        "depends_on": [7],
        "timeout_minutes": 15
      }
    ]'::jsonb;
  END IF;

  RAISE EXCEPTION 'Unknown pipeline template: %', template_name;
END;
$$;

-- ============================================================
-- HELPER VIEWS
-- ============================================================

-- Active pipelines with current step info
CREATE OR REPLACE VIEW v_active_pipelines AS
SELECT
  pe.id AS pipeline_id,
  pe.objective,
  pe.status AS pipeline_status,
  pe.current_step_index,
  pe.created_at AS pipeline_started,
  ps.step_name AS current_step_name,
  ps.step_display_name AS current_step_display,
  ps.status AS step_status,
  ps.agent_name,
  pe.total_input_tokens + pe.total_output_tokens AS total_tokens,
  pe.total_cost_usd,
  c.name AS client_name
FROM pipeline_executions pe
LEFT JOIN pipeline_steps ps ON ps.pipeline_id = pe.id AND ps.step_index = pe.current_step_index
LEFT JOIN clients c ON c.id = pe.client_id
WHERE pe.status IN ('running', 'paused_hitl', 'pending')
ORDER BY pe.created_at DESC;

-- HITL inbox (pending human approvals)
CREATE OR REPLACE VIEW v_hitl_inbox AS
SELECT
  ps.id AS step_id,
  pe.id AS pipeline_id,
  pe.objective,
  ps.step_index,
  ps.step_display_name,
  ps.output_text,
  ps.hitl_status,
  ps.created_at AS submitted_at,
  c.name AS client_name,
  pe.created_by
FROM pipeline_steps ps
JOIN pipeline_executions pe ON pe.id = ps.pipeline_id
LEFT JOIN clients c ON c.id = pe.client_id
WHERE ps.hitl_required = true
  AND ps.hitl_status = 'pending'
  AND ps.status = 'paused_hitl'
ORDER BY ps.created_at ASC;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Atomically increment pipeline cost counters
CREATE OR REPLACE FUNCTION increment_pipeline_costs(
  p_pipeline_id uuid,
  p_input_tokens int,
  p_output_tokens int,
  p_cost_usd numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pipeline_executions
  SET
    total_input_tokens = total_input_tokens + p_input_tokens,
    total_output_tokens = total_output_tokens + p_output_tokens,
    total_cost_usd = total_cost_usd + p_cost_usd
  WHERE id = p_pipeline_id;
END;
$$;

-- RLS policies (admin only for now)
ALTER TABLE pipeline_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access pipeline_executions" ON pipeline_executions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access pipeline_steps" ON pipeline_steps
  FOR ALL USING (true) WITH CHECK (true);
