-- ============================================================================
-- Migration: 202605010001_mc_inbox_hitl_cycles
-- Purpose:   Dedicated audit table for HITL cycle-complete notifications
--            emitted by the n8n HITL workflow every 15 min. Closes B-001
--            backend gap — /api/mc-sync now persists `hitl_cycle_complete`
--            payloads here instead of returning 400.
--
--            A separate table (vs. reusing mission_control_inbox) is required
--            because mission_control_inbox.type has a CHECK constraint that
--            only accepts {approval, report, update, error, delegation} and
--            HITL cycle pings are high-frequency telemetry — mixing them with
--            the human-facing inbox would clutter the dashboard.
-- Author:    CC#3 · Wave 14 · T4
-- Idempotent: yes · safe to re-run
-- Rollback:  DROP TABLE IF EXISTS mc_inbox_hitl_cycles CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS mc_inbox_hitl_cycles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id         TEXT NOT NULL,
  queue_depth      INTEGER NOT NULL CHECK (queue_depth >= 0),
  items_processed  INTEGER NOT NULL CHECK (items_processed >= 0),
  cycle_timestamp  TIMESTAMPTZ NOT NULL,
  payload          JSONB NOT NULL,
  source           TEXT NOT NULL DEFAULT 'n8n-hitl-workflow',
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recent cycles dashboard query — sorted-by-time index.
CREATE INDEX IF NOT EXISTS idx_mc_inbox_hitl_cycles_received_at
  ON mc_inbox_hitl_cycles (received_at DESC);

-- Lookup-by-cycle for replay/idempotency analysis.
CREATE INDEX IF NOT EXISTS idx_mc_inbox_hitl_cycles_cycle_id
  ON mc_inbox_hitl_cycles (cycle_id);

COMMENT ON TABLE mc_inbox_hitl_cycles IS
  'Audit log of HITL workflow cycle-complete pings (every 15 min from n8n). '
  'Powers Mission Control freshness signal + B-001 verification.';
