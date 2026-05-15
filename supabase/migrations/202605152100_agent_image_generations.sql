-- Sprint #6 Brazo 1 · agent_image_generations + agent-images storage bucket
--
-- Backs POST /api/images/generate · the GPT Image wrapper that replaces the
-- (never-shipped) Ideogram stub. Stack canonical = gpt-image-1 per STACK_FINAL_V3.
--
-- Persistence pattern mirrors agent_invocations: client_id is TEXT (soft link
-- to clients.id) so the multi-path resolver (Fix 8b/8c) populates it without
-- a strict FK that would reject UUIDs from legacy callers, and we get an
-- index for the cost-by-client breakdown that Sprint #4 Fase E uses.
--
-- Idempotent · safe to re-run.

CREATE TABLE IF NOT EXISTS agent_image_generations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT,
  agent_slug      TEXT,
  prompt          TEXT NOT NULL,
  revised_prompt  TEXT,
  storage_path    TEXT,
  image_url       TEXT,
  size            TEXT NOT NULL DEFAULT '1024x1024',
  model           TEXT NOT NULL DEFAULT 'gpt-image-1',
  cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('completed', 'failed')),
  error_message   TEXT,
  raw_response    JSONB,
  caller          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_image_generations_client_created
  ON agent_image_generations (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_image_generations_agent_created
  ON agent_image_generations (agent_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_image_generations_status
  ON agent_image_generations (status, created_at DESC)
  WHERE status = 'failed';

ALTER TABLE agent_image_generations ENABLE ROW LEVEL SECURITY;

-- Service-role only · same pattern as agent_invocations / cost_alerts_state.
-- The Vercel route uses the service-role key so all writes flow through it.
DROP POLICY IF EXISTS "agent_image_generations_service_role_all"
  ON agent_image_generations;

CREATE POLICY "agent_image_generations_service_role_all"
  ON agent_image_generations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE agent_image_generations IS
  'GPT Image (gpt-image-1) generation log. Caller: POST /api/images/generate. '
  'Sprint #6 Brazo 1. client_id is TEXT not FK to mirror agent_invocations '
  'and let the multi-path resolver (Fix 8b/8c) populate it without breakage.';

-- agent-images storage bucket · public-read so generated URLs are usable
-- directly in Notion / GHL / dashboards without service-role tokens. The
-- payload is the AI-generated image, not customer PII, so public-read is
-- the right default. INSERT ... ON CONFLICT keeps this idempotent.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-images',
  'agent-images',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
