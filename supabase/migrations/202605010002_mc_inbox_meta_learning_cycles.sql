-- ============================================================================
-- Migration: 202605010002_mc_inbox_meta_learning_cycles
-- Purpose:   Audit table for Meta-Agent Weekly Learning Cycle telemetry
--            emitted by the n8n workflow `Zero Risk - Meta-Agent Weekly
--            Learning Cycle` (cron Monday 9am). Closes W15-T6 backend gap
--            surfaced by the W15-T5 MC integration contract audit (silent
--            400 "Unknown action: meta_learning_complete" since deploy).
--
--            Separate from mc_inbox_hitl_cycles for the same reason — both
--            tables are append-only telemetry, distinct cadence (weekly vs
--            15min), and distinct payload shape. Keeping them separate keeps
--            queries simple and indexes lean.
-- Author:    CC#3 · Wave 15 · T6
-- Idempotent: yes · safe to re-run
-- Rollback:  DROP TABLE IF EXISTS mc_inbox_meta_learning_cycles CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS mc_inbox_meta_learning_cycles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week               TEXT NOT NULL,
  tasks_analyzed     INTEGER NOT NULL CHECK (tasks_analyzed >= 0),
  success_rate       TEXT NOT NULL,
  proposals_queued   INTEGER NOT NULL CHECK (proposals_queued >= 0),
  cycle_timestamp    TIMESTAMPTZ NOT NULL,
  payload            JSONB NOT NULL,
  source             TEXT NOT NULL DEFAULT 'n8n-meta-agent-weekly-cycle',
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recent cycles dashboard query.
CREATE INDEX IF NOT EXISTS idx_mc_inbox_meta_learning_received_at
  ON mc_inbox_meta_learning_cycles (received_at DESC);

-- Lookup-by-week for replay/idempotency analysis.
CREATE INDEX IF NOT EXISTS idx_mc_inbox_meta_learning_week
  ON mc_inbox_meta_learning_cycles (week);

COMMENT ON TABLE mc_inbox_meta_learning_cycles IS
  'Audit log of Meta-Agent Weekly Learning Cycle pings (Mondays 9am from n8n). '
  'Closes W15-T6 contract gap.';
