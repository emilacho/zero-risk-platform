-- Sprint 8D · Brain RAG Gap 2 fix · embedding_version column + staleness alert support.
--
-- Adds `embedding_version` column to client_brain_chunks · default
-- 'text-embedding-3-small@1536' canonical. Allows future model upgrade
-- detection (cron compares OPENAI_EMBEDDING_MODEL env vs MIN(embedding_version)
-- across all chunks · alerts Slack si differs · candidate re-embed).
--
-- Idempotent · IF NOT EXISTS semantics throughout.

BEGIN;

-- Add embedding_version column · default canonical model identifier
ALTER TABLE client_brain_chunks
  ADD COLUMN IF NOT EXISTS embedding_version text NOT NULL DEFAULT 'text-embedding-3-small@1536';

-- Backfill existing rows · default applied automatically by NOT NULL DEFAULT
-- but explicit UPDATE for clarity (no-op if already populated)
UPDATE client_brain_chunks
SET embedding_version = 'text-embedding-3-small@1536'
WHERE embedding_version IS NULL OR embedding_version = '';

-- Index for staleness queries (find chunks with old embedding_version efficiently)
CREATE INDEX IF NOT EXISTS idx_brain_chunks_embedding_version
  ON client_brain_chunks (embedding_version);

COMMENT ON COLUMN client_brain_chunks.embedding_version IS
  'Sprint 8D · model+dimensions identifier (e.g. text-embedding-3-small@1536) · used by daily staleness alert cron · re-embed required cuando model upgrade';

COMMIT;
