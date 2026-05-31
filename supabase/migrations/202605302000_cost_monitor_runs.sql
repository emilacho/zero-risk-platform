-- §150 G5 cost monitor · audit trail table · SHADOW-first deployment
--
-- Every run of /api/cost-monitor/cron inserts one row · breach or no-breach.
-- During SHADOW phase (initial deployment) breaches are detected and logged
-- but NO Slack alert is dispatched. After baseline established (see runbook),
-- alert dispatch is enabled via a separate flip.
--
-- Canon · §150 G4 audit trail compliance · cada corrida deja row · forensics
-- queries pre-emptive viables. Canon · §150 G5 cost monitor · burst + daily.

CREATE TABLE IF NOT EXISTS public.cost_monitor_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Aggregate spend (USD) over the two windows the cron evaluates.
  aggregate_24h_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
  aggregate_1h_usd  NUMERIC(10, 4) NOT NULL DEFAULT 0,

  -- Threshold snapshot · captured at run time so historical rows remain
  -- interpretable even after thresholds are tuned in code.
  threshold_daily_per_workflow_usd NUMERIC(10, 4) NOT NULL,
  threshold_daily_aggregate_usd    NUMERIC(10, 4) NOT NULL,
  threshold_hourly_burst_usd       NUMERIC(10, 4) NOT NULL,

  -- Breach summary. `is_breach=true` when any of the 3 thresholds exceeded.
  -- `breach_count` is the number of distinct breach types (1-3 possible).
  is_breach    BOOLEAN NOT NULL DEFAULT FALSE,
  breach_count INT     NOT NULL DEFAULT 0,

  -- Detailed per-workflow breakdown + breach details. Shape ·
  --   {
  --     "per_workflow_24h": { "<workflow_id>": <usd>, ... },
  --     "breaches": [
  --       { "type": "daily_per_workflow", "workflow_id": "...", "spend_usd": 12.34, "threshold": 10 },
  --       { "type": "daily_aggregate",    "spend_usd": 110.5, "threshold": 100 },
  --       { "type": "hourly_burst",       "spend_usd": 8.21,  "threshold": 5 }
  --     ],
  --     "invocations_24h": 1234,
  --     "invocations_1h":  42
  --   }
  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- SHADOW-phase metadata · whether this run WOULD have dispatched an alert
  -- if shadow-mode were off. Used during baseline phase to count would-be
  -- alerts and tune thresholds before flipping to live.
  shadow_mode BOOLEAN NOT NULL DEFAULT TRUE,
  alert_dispatched BOOLEAN NOT NULL DEFAULT FALSE,

  -- Optional · error message if the cron itself failed (insert still happens
  -- so we have evidence the cron fired).
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time-ordered queries (forensics, baseline-building, recent runs).
CREATE INDEX IF NOT EXISTS idx_cost_monitor_runs_ran_at
  ON public.cost_monitor_runs (ran_at DESC);

-- Breach-only forensics · partial index for fast "show me the breaches" queries.
CREATE INDEX IF NOT EXISTS idx_cost_monitor_runs_breaches
  ON public.cost_monitor_runs (ran_at DESC)
  WHERE is_breach = TRUE;

COMMENT ON TABLE public.cost_monitor_runs IS
  '§150 G5 cost monitor audit trail. Every /api/cost-monitor/cron run inserts one row. SHADOW-first · breach detection logs to details JSONB but alert dispatch gated by shadow_mode flag until baseline established.';

COMMENT ON COLUMN public.cost_monitor_runs.shadow_mode IS
  'TRUE = breach detected and logged but NO Slack alert sent. FALSE = alert-live (post baseline flip). See runbook-corte-manual-costo.md for the flip procedure.';

COMMENT ON COLUMN public.cost_monitor_runs.details IS
  'JSONB with per_workflow_24h aggregation + breaches array + invocation counts. Shape documented in migration source.';
