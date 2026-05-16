-- Sprint #6 Brazo Meshy 3D · agent_3d_generations + agent-3d-models bucket
--
-- Backs POST /api/3d/generate · the Meshy.ai wrapper that adds 3D model
-- generation to the brazo lineup. Stack canonical · Meshy.ai approved via
-- phase transition 2026-05-16 (STACK_FINAL_V3.md Bloque 2 entry · Spline
-- manual NO escala >5 clientes · Meshy API generated 3D scales linearly).
--
-- Persistence pattern · mirrors agent_image_generations · client_id TEXT
-- (soft link · resolver Fix 8b/8c chain compatible) · public bucket so
-- generated GLB/FBX/OBJ URLs are usable from Notion/Spline/Three.js
-- viewers without service-role tokens.
--
-- Idempotent · safe to re-run.

CREATE TABLE IF NOT EXISTS agent_3d_generations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT,
  agent_slug      TEXT,
  prompt          TEXT NOT NULL,
  art_style       TEXT NOT NULL DEFAULT 'realistic'
                  CHECK (art_style IN ('realistic', 'cartoon', 'low-poly', 'sculpture', 'pbr')),
  format          TEXT NOT NULL DEFAULT 'glb'
                  CHECK (format IN ('glb', 'fbx', 'obj', 'usdz', 'mtl')),
  type            TEXT NOT NULL DEFAULT 'object'
                  CHECK (type IN ('object', 'character', 'environment')),
  meshy_task_id   TEXT,
  storage_path    TEXT,
  model_url       TEXT,
  thumbnail_url   TEXT,
  polycount       INTEGER,
  model           TEXT NOT NULL DEFAULT 'meshy-4',
  cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
  duration_ms     INTEGER,
  status          TEXT NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('completed', 'failed', 'timeout')),
  error_message   TEXT,
  raw_response    JSONB,
  caller          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_3d_generations_client_created
  ON agent_3d_generations (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_3d_generations_status
  ON agent_3d_generations (status, created_at DESC)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_agent_3d_generations_meshy_task
  ON agent_3d_generations (meshy_task_id)
  WHERE meshy_task_id IS NOT NULL;

ALTER TABLE agent_3d_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_3d_generations_service_role_all"
  ON agent_3d_generations;

CREATE POLICY "agent_3d_generations_service_role_all"
  ON agent_3d_generations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE agent_3d_generations IS
  'Meshy.ai (meshy-4) 3D model generation log. Caller: POST /api/3d/generate. '
  'Sprint #6 Brazo Meshy. client_id is TEXT not FK · mirrors agent_image_generations.';

-- client-websites bucket already exists (created en Sprint #6 Brazo 2
-- Náufrago dispatch · public read · 10MB limit). 3D models go to
-- `client-websites/{slug}/3d-models/` path. We update the allowed_mime_types
-- to include GLB/FBX/OBJ binary formats so uploads don't bounce on MIME
-- check. Idempotent UPSERT via ON CONFLICT.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-websites',
  'client-websites',
  true,
  52428800,
  ARRAY[
    'application/json',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'text/markdown',
    'text/plain',
    'model/gltf-binary',
    'model/gltf+json',
    'application/octet-stream',
    'application/x-tgif',
    'application/vnd.usdz+zip'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
