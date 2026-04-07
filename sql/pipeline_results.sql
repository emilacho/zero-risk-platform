-- Zero Risk V2 — pipeline_results table
-- Stores async Agent Pipeline executions for the JARVIS Command Center.
--
-- Flow:
--   1. POST /api/agents/pipeline   → INSERT row (status=pending), POST to n8n, return id
--   2. n8n runs the chain (RUFLO → Jefe → Empleados → Consolidación)
--   3. n8n final node POST /api/agents/pipeline/callback → UPDATE row (status=completed/error)
--   4. JARVIS polls /api/agents/pipeline/status/{id} every 3s until terminal status
--
-- Apply via Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS pipeline_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'error')),
  result JSONB,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pipeline_results_status_idx
  ON pipeline_results (status);

CREATE INDEX IF NOT EXISTS pipeline_results_created_at_idx
  ON pipeline_results (created_at DESC);

-- Auto-update updated_at on row updates
CREATE OR REPLACE FUNCTION update_pipeline_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pipeline_results_updated_at ON pipeline_results;
CREATE TRIGGER pipeline_results_updated_at
  BEFORE UPDATE ON pipeline_results
  FOR EACH ROW
  EXECUTE FUNCTION update_pipeline_results_updated_at();

-- RLS: only authenticated users can read; service role bypasses
ALTER TABLE pipeline_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_results_authenticated_read" ON pipeline_results;
CREATE POLICY "pipeline_results_authenticated_read"
  ON pipeline_results FOR SELECT
  TO authenticated
  USING (true);
