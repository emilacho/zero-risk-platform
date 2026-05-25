-- Sprint 8D tail · workflow checkpoint/resume pattern canon (2026-05-25 CC#2)
--
-- Prevents duplicate upstream work when a workflow is re-triggered with the
-- same (workflow_id, client_id) combination. CC#3 forensics deep detected
-- $7.78 waste in 1 day from 3 Peniche re-smokes restarting Steps 1+4+5+brand
-- from scratch (37% of day spend).
--
-- Canon idempotency guardrail #3 from `wiki/decisions/2026-05-24-canon-loop-coherente-6-guardrails.md`.
--
-- Schema · 1 row per (workflow_id, client_id, step_name) tuple. Unique
-- constraint allows safe re-trigger semantics · downstream callers either
-- (a) skip-if-completed (default force_restart=false) or (b) re-run
-- ignoring checkpoints (force_restart=true via context flag).
--
-- output_ref jsonb · canonical reference to where the step's output lives
-- (e.g. {table: 'agent_invocations', id: '<uuid>'} or {table: 'agents_log',
-- id: '<uuid>'}). Callers can re-hydrate the cached output from the
-- referenced row · keeps this table small (no payload duplication).

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id text NOT NULL,
  workflow_execution_id text,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  step_status text NOT NULL CHECK (step_status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
  output_ref jsonb,
  cost_usd numeric,
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, client_id, step_name)
);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_client
  ON workflow_checkpoints (client_id, workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_status
  ON workflow_checkpoints (step_status)
  WHERE step_status IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_lookup
  ON workflow_checkpoints (workflow_id, client_id, step_name, step_status);

-- Trigger to maintain updated_at on row update
CREATE OR REPLACE FUNCTION workflow_checkpoints_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_checkpoints_updated_at ON workflow_checkpoints;
CREATE TRIGGER trg_workflow_checkpoints_updated_at
  BEFORE UPDATE ON workflow_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION workflow_checkpoints_set_updated_at();

COMMENT ON TABLE workflow_checkpoints IS
  'Sprint 8D canon · idempotency guardrail #3 · step-level checkpointing per (workflow_id, client_id, step_name) · prevents duplicate upstream work on re-trigger · default skip-if-completed semantics · force_restart flag bypass';
