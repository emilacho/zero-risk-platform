-- Sprint #8 Workstream D · creative_embeddings (pgvector)
--
-- Backs POST /api/embeddings/creative + GET /api/embeddings/recommend.
-- Cross-cliente vector search of Meta Ads creatives keyed by performance_score
-- so the recommender returns "creatives semantically similar to this brief
-- that *worked well* historically."
--
-- Stack canon · OpenAI text-embedding-3-small · 1536 dims · $0.02/1M tokens.
-- OpenAI already in stack (GPT-Image-1.5) · 0 new providers.
--
-- Idempotent · safe to re-run.

-- ============================================================================
-- 1 · Enable pgvector (already enabled by sql/client_brain_schema.sql · re-asserted)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2 · creative_embeddings
-- ============================================================================

CREATE TABLE IF NOT EXISTS creative_embeddings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id       TEXT NOT NULL UNIQUE,
  client_id         TEXT,
  campaign_id       TEXT,
  content_text      TEXT NOT NULL,
  embedding         vector(1536),
  model             TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  dimensions        INTEGER NOT NULL DEFAULT 1536,
  performance_score NUMERIC(8, 4),
  raw_meta          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_embeddings_client_score
  ON creative_embeddings (client_id, performance_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_creative_embeddings_campaign
  ON creative_embeddings (campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

-- ivfflat ANN index · lists=100 fits ~10K-100K vectors range typical for early
-- stage · upgrade to hnsw or higher lists when corpus grows >100K.
CREATE INDEX IF NOT EXISTS idx_creative_embeddings_vector_cosine
  ON creative_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE creative_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creative_embeddings_service_role_all"
  ON creative_embeddings;

CREATE POLICY "creative_embeddings_service_role_all"
  ON creative_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE creative_embeddings IS
  'OpenAI text-embedding-3-small (1536 dims) for Meta Ads creatives. '
  'Cross-cliente cosine-similarity search keyed by performance_score for '
  'recommender pipeline. Caller: POST /api/embeddings/creative (write) + '
  'GET /api/embeddings/recommend (read).';

-- ============================================================================
-- 3 · RPC · match_creative_embeddings (top-K cosine search with filters)
-- ============================================================================

CREATE OR REPLACE FUNCTION match_creative_embeddings(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 10,
  min_performance_score NUMERIC DEFAULT NULL,
  filter_client_id TEXT DEFAULT NULL,
  exclude_client_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  creative_id TEXT,
  client_id TEXT,
  campaign_id TEXT,
  content_text TEXT,
  performance_score NUMERIC,
  similarity NUMERIC,
  raw_meta JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.creative_id,
    ce.client_id,
    ce.campaign_id,
    ce.content_text,
    ce.performance_score,
    (1 - (ce.embedding <=> query_embedding))::NUMERIC AS similarity,
    ce.raw_meta,
    ce.created_at
  FROM creative_embeddings ce
  WHERE ce.embedding IS NOT NULL
    AND (min_performance_score IS NULL OR ce.performance_score >= min_performance_score)
    AND (filter_client_id IS NULL OR ce.client_id = filter_client_id)
    AND (exclude_client_id IS NULL OR ce.client_id IS NULL OR ce.client_id <> exclude_client_id)
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_creative_embeddings IS
  'Top-K cosine search over creative_embeddings. Supports filters: '
  'min_performance_score (keep only proven winners) · filter_client_id (scope to single client) · '
  'exclude_client_id (cross-cliente recommend · exclude requester own creatives).';
