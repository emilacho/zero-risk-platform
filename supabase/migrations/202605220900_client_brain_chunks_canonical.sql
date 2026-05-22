-- Sprint 7.5 A1 + A2 · Client Brain RAG canonical wire-in
-- 2026-05-22 · CC#1 · gap close · per master plan
-- zr-vault/raw/refs/2026-05-22-sprint7p5-emergency-brain-wire-in-master-plan.md
--
-- Pre-state · 4 source tables already exist (client_brand_books · client_icp_documents
-- · client_voc_library · client_competitive_landscape) but NO unified retrieval table
-- + NO query_client_brain RPC in prod · runtime path broken.
--
-- This migration adds ·
--   1. `client_brain_chunks` · unified embedding store · vector(1536) per
--      text-embedding-3-small canon (cheaper than 3072 large)
--   2. HNSW index on embedding · cosine similarity ops · O(log n) lookups
--   3. `query_client_brain` RPC · returns top_k chunks for (client_id, query_embedding)
--   4. RLS · service_role bypass · authenticated admin via app_roles
--
-- Idempotent · CREATE IF NOT EXISTS + ON CONFLICT semantics throughout.
--
-- Note · existing per-section embedding columns (`vector(3072)`) in the 4
-- source tables are LEGACY · this migration does NOT remove them. The chunks
-- table is the new canonical retrieval surface. Per master plan A7 ·
-- MCP server tool-on-demand pattern deprecated · push-enrichment in
-- agent-sdk-runner is the canonical access path.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS client_brain_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_table    text NOT NULL CHECK (source_table IN (
                    'client_brand_books',
                    'client_icp_documents',
                    'client_voc_library',
                    'client_competitive_landscape',
                    'client_historical_outputs'
                  )),
  source_id       uuid NOT NULL,
  section_label   text NOT NULL,
  chunk_text      text NOT NULL,
  embedding       vector(1536),
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, source_table, source_id, section_label)
);

CREATE INDEX IF NOT EXISTS idx_brain_chunks_client
  ON client_brain_chunks (client_id);
CREATE INDEX IF NOT EXISTS idx_brain_chunks_source
  ON client_brain_chunks (source_table, source_id);

-- HNSW index for cosine similarity · O(log n) approximate nearest neighbor
-- m=16 + ef_construction=64 are pgvector defaults · tuned for ≤100k chunks.
CREATE INDEX IF NOT EXISTS idx_brain_chunks_hnsw
  ON client_brain_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE client_brain_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chunks_service_role_all ON client_brain_chunks;
CREATE POLICY chunks_service_role_all ON client_brain_chunks
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chunks_admin_full ON client_brain_chunks;
CREATE POLICY chunks_admin_full ON client_brain_chunks
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE client_brain_chunks IS
  'Sprint 7.5 · canonical RAG chunks · text-embedding-3-small 1536d · queried via query_client_brain RPC + push-enriched in agent-sdk-runner';

-- ── RPC · query_client_brain · cosine similarity search ────────────────────
--
-- Returns top_k chunks ordered by cosine distance (1 - similarity desc).
-- App code generates embedding via lib/brain/embed.ts then passes here.
-- We do NOT call OpenAI from inside the RPC · keeping the DB layer pure SQL.

DROP FUNCTION IF EXISTS query_client_brain(uuid, vector, int);
DROP FUNCTION IF EXISTS query_client_brain(uuid, vector(1536), int);
DROP FUNCTION IF EXISTS query_client_brain(uuid, vector(3072), text[], int);

CREATE OR REPLACE FUNCTION query_client_brain(
  p_client_id uuid,
  p_query_embedding vector(1536),
  p_top_k int DEFAULT 5
)
RETURNS TABLE (
  chunk_id      uuid,
  source_table  text,
  source_id     uuid,
  section_label text,
  chunk_text    text,
  similarity    float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id           AS chunk_id,
    source_table,
    source_id,
    section_label,
    chunk_text,
    1.0 - (embedding <=> p_query_embedding) AS similarity
  FROM client_brain_chunks
  WHERE client_id = p_client_id
    AND embedding IS NOT NULL
  ORDER BY embedding <=> p_query_embedding
  LIMIT GREATEST(LEAST(p_top_k, 50), 1)
$$;

COMMENT ON FUNCTION query_client_brain(uuid, vector(1536), int) IS
  'Sprint 7.5 · cosine similarity search over client_brain_chunks · returns top_k ranked by relevance';

COMMIT;
