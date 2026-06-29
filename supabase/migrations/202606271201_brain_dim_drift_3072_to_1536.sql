-- Sprint-brain §144 · FASE A · A2 · drift de dimensiones de embedding
-- 2026-06-27 · CC#1 · branch/shadow · NO aplicar a prod sin §144 (R10 single-file)
-- Plan · 00-meta/opus-4-8-traspaso/SPRINT-brain-plan-2026-06-09.md
--
-- Problema (CC#1 audit ground-truth 2026-06-09 + reverify 2026-06-27) ·
--   Las 3 tablas estructuradas fuente declaran `embedding vector(3072)`
--   (anticipando text-embedding-3-large que nunca se adoptó) · pero el modelo
--   canónico es `text-embedding-3-small@1536`. La tabla canónica de RAG
--   `client_brain_chunks` ya es vector(1536). Hoy las 3 columnas 3072 están
--   100% NULL · 0 readers · 0 writers (verificado · §148) · el drift no tiene
--   impacto runtime PERO bloquea cualquier embed directo (insert 1536 en
--   col 3072 falla) y deja las RPC legacy `search_*` con firma 3072 inservible.
--
-- Este cambio ·
--   1. ALTER de las 3 columnas embedding 3072 → 1536 (lossless · todas NULL).
--   2. Recrea las 5 RPC legacy `search_*` a vector(1536) para que queden
--      consistentes (siguen sin usarse en el código · canon read = chunks RPC
--      `query_client_brain` 3-arg · pero las dejamos coherentes en vez de rotas).
--
-- NOTA · esto NO embebe contenido. El RAG canónico lee `client_brain_chunks`
-- (las estructuradas son FUENTE · ya se chunkean ahí). Un embed directo de las
-- estructuradas es redundante con chunks · queda como decisión §144 (decisión #1
-- del plan) · si se ratifica · se agrega un backfill aparte.
--
-- Idempotente · ALTER TYPE no-op si ya es 1536 · CREATE OR REPLACE en funciones.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- 1 · ALTER columnas embedding 3072 → 1536 (lossless · todas las filas NULL).
--     USING NULL es explícito · cualquier embedding 3072 previo sería de
--     dimensión equivocada de todos modos (modelo canónico = 1536).
ALTER TABLE client_competitive_landscape
  ALTER COLUMN embedding TYPE vector(1536) USING NULL;
ALTER TABLE client_icp_documents
  ALTER COLUMN embedding TYPE vector(1536) USING NULL;
ALTER TABLE client_voc_library
  ALTER COLUMN embedding TYPE vector(1536) USING NULL;

-- (client_brand_books + client_historical_outputs también declaran vector(3072)
--  en el schema V3 · se alinean por consistencia · mismo razonamiento.)
ALTER TABLE client_brand_books
  ALTER COLUMN embedding TYPE vector(1536) USING NULL;
ALTER TABLE client_historical_outputs
  ALTER COLUMN embedding TYPE vector(1536) USING NULL;

-- 2 · Recrear las 5 RPC legacy `search_*` a vector(1536) (firma + body).
--     No se usan en el código canónico (read = query_client_brain 3-arg sobre
--     client_brain_chunks) pero las dejamos coherentes con la nueva dimensión.
DROP FUNCTION IF EXISTS search_brand_books(uuid, vector, integer);
DROP FUNCTION IF EXISTS search_brand_books(uuid, vector(3072), integer);
CREATE OR REPLACE FUNCTION search_brand_books(
  p_client_id uuid, p_query_embedding vector(1536), p_match_count integer DEFAULT 3
) RETURNS TABLE (id uuid, content_text text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT bb.id, bb.content_text, 1 - (bb.embedding <=> p_query_embedding)
  FROM client_brand_books bb
  WHERE bb.client_id = p_client_id AND bb.embedding IS NOT NULL
  ORDER BY bb.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

DROP FUNCTION IF EXISTS search_icp_documents(uuid, vector, integer);
DROP FUNCTION IF EXISTS search_icp_documents(uuid, vector(3072), integer);
CREATE OR REPLACE FUNCTION search_icp_documents(
  p_client_id uuid, p_query_embedding vector(1536), p_match_count integer DEFAULT 5
) RETURNS TABLE (id uuid, audience_segment text, content_text text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT icp.id, icp.audience_segment, icp.content_text, 1 - (icp.embedding <=> p_query_embedding)
  FROM client_icp_documents icp
  WHERE icp.client_id = p_client_id AND icp.embedding IS NOT NULL
  ORDER BY icp.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

DROP FUNCTION IF EXISTS search_voc_library(uuid, vector, integer);
DROP FUNCTION IF EXISTS search_voc_library(uuid, vector(3072), integer);
CREATE OR REPLACE FUNCTION search_voc_library(
  p_client_id uuid, p_query_embedding vector(1536), p_match_count integer DEFAULT 10
) RETURNS TABLE (id uuid, quote_text text, source text, sentiment text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT v.id, v.quote_text, v.source, v.sentiment, 1 - (v.embedding <=> p_query_embedding)
  FROM client_voc_library v
  WHERE v.client_id = p_client_id AND v.embedding IS NOT NULL
  ORDER BY v.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

DROP FUNCTION IF EXISTS search_competitive_landscape(uuid, vector, integer);
DROP FUNCTION IF EXISTS search_competitive_landscape(uuid, vector(3072), integer);
CREATE OR REPLACE FUNCTION search_competitive_landscape(
  p_client_id uuid, p_query_embedding vector(1536), p_match_count integer DEFAULT 5
) RETURNS TABLE (id uuid, competitor_name text, content_text text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT cl.id, cl.competitor_name, cl.content_text, 1 - (cl.embedding <=> p_query_embedding)
  FROM client_competitive_landscape cl
  WHERE cl.client_id = p_client_id AND cl.embedding IS NOT NULL
  ORDER BY cl.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

DROP FUNCTION IF EXISTS search_historical_outputs(uuid, vector, integer);
DROP FUNCTION IF EXISTS search_historical_outputs(uuid, vector(3072), integer);
CREATE OR REPLACE FUNCTION search_historical_outputs(
  p_client_id uuid, p_query_embedding vector(1536), p_match_count integer DEFAULT 5
) RETURNS TABLE (id uuid, title text, output_type text, content_text text, status text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT ho.id, ho.title, ho.output_type, ho.content_text, ho.status, 1 - (ho.embedding <=> p_query_embedding)
  FROM client_historical_outputs ho
  WHERE ho.client_id = p_client_id AND ho.embedding IS NOT NULL
  ORDER BY ho.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

COMMIT;
