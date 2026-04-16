-- ============================================================
-- ZERO RISK V3 — Embedding Helper Functions
-- Pilar 2: Client Brain con RAG Semántico
--
-- These helper functions simplify embedding operations from
-- the application layer (Next.js API routes, n8n webhooks).
--
-- The actual embedding generation happens in the Edge Function
-- `generate-embedding`. These DB functions handle the storage
-- and content_text preparation side.
-- ============================================================

-- ============================================================
-- Helper: Prepare content_text for brand book embedding
-- Concatenates all relevant brand book fields into a single
-- searchable text block for embedding generation
-- ============================================================
CREATE OR REPLACE FUNCTION prepare_brand_book_content(p_brand_book_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_content TEXT;
BEGIN
  SELECT
    COALESCE('Brand Purpose: ' || brand_purpose || E'\n', '') ||
    COALESCE('Vision: ' || brand_vision || E'\n', '') ||
    COALESCE('Mission: ' || brand_mission || E'\n', '') ||
    COALESCE('Personality: ' || brand_personality || E'\n', '') ||
    COALESCE('Voice: ' || voice_description || E'\n', '') ||
    COALESCE('Writing Style: ' || writing_style || E'\n', '') ||
    COALESCE('Tagline: ' || tagline || E'\n', '') ||
    COALESCE('Elevator Pitch: ' || elevator_pitch || E'\n', '') ||
    COALESCE('Imagery Style: ' || imagery_style || E'\n', '') ||
    COALESCE('Values: ' || brand_values::TEXT || E'\n', '') ||
    COALESCE('Key Messages: ' || key_messages::TEXT || E'\n', '') ||
    COALESCE('Value Propositions: ' || value_propositions::TEXT || E'\n', '') ||
    COALESCE('Compliance: ' || compliance_notes || E'\n', '')
  INTO v_content
  FROM client_brand_books
  WHERE id = p_brand_book_id;

  -- Also update content_text in the row
  UPDATE client_brand_books
  SET content_text = v_content
  WHERE id = p_brand_book_id;

  RETURN v_content;
END;
$$;

-- ============================================================
-- Helper: Prepare content_text for ICP document embedding
-- ============================================================
CREATE OR REPLACE FUNCTION prepare_icp_content(p_icp_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_content TEXT;
BEGIN
  SELECT
    'Audience Segment: ' || audience_segment || E'\n' ||
    COALESCE('Company Size: ' || company_size || E'\n', '') ||
    COALESCE('Geography: ' || geography || E'\n', '') ||
    COALESCE('Job Titles: ' || job_titles::TEXT || E'\n', '') ||
    COALESCE('Industries: ' || industries::TEXT || E'\n', '') ||
    COALESCE('Goals: ' || goals::TEXT || E'\n', '') ||
    COALESCE('Pain Points: ' || pain_points::TEXT || E'\n', '') ||
    COALESCE('Jobs to be Done: ' || jobs_to_be_done::TEXT || E'\n', '') ||
    COALESCE('Objections: ' || objections::TEXT || E'\n', '') ||
    COALESCE('Buying Process: ' || buying_process || E'\n', '') ||
    COALESCE('Decision Criteria: ' || decision_criteria::TEXT || E'\n', '') ||
    COALESCE('Budget Range: ' || budget_range || E'\n', '') ||
    COALESCE('Content Preferences: ' || content_preferences || E'\n', '') ||
    COALESCE('Key Messages: ' || key_messages_for_segment::TEXT || E'\n', '')
  INTO v_content
  FROM client_icp_documents
  WHERE id = p_icp_id;

  UPDATE client_icp_documents
  SET content_text = v_content
  WHERE id = p_icp_id;

  RETURN v_content;
END;
$$;

-- ============================================================
-- Helper: Prepare content_text for VOC entry embedding
-- ============================================================
CREATE OR REPLACE FUNCTION prepare_voc_content(p_voc_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_content TEXT;
BEGIN
  SELECT
    'Customer Quote: "' || quote_text || '"' || E'\n' ||
    'Source: ' || source || E'\n' ||
    'Sentiment: ' || sentiment || E'\n' ||
    COALESCE('Customer Segment: ' || customer_segment || E'\n', '') ||
    COALESCE('Category: ' || category || E'\n', '') ||
    COALESCE('Themes: ' || themes::TEXT || E'\n', '')
  INTO v_content
  FROM client_voc_library
  WHERE id = p_voc_id;

  UPDATE client_voc_library
  SET content_text = v_content
  WHERE id = p_voc_id;

  RETURN v_content;
END;
$$;

-- ============================================================
-- Helper: Prepare content_text for competitor embedding
-- ============================================================
CREATE OR REPLACE FUNCTION prepare_competitor_content(p_competitor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_content TEXT;
BEGIN
  SELECT
    'Competitor: ' || competitor_name || E'\n' ||
    'Type: ' || competitor_type || E'\n' ||
    COALESCE('Website: ' || competitor_website || E'\n', '') ||
    COALESCE('Tagline: ' || tagline || E'\n', '') ||
    COALESCE('Value Proposition: ' || value_proposition || E'\n', '') ||
    COALESCE('Key Differentiators: ' || key_differentiators::TEXT || E'\n', '') ||
    COALESCE('Weaknesses: ' || weaknesses::TEXT || E'\n', '') ||
    COALESCE('Target Audience: ' || target_audience || E'\n', '') ||
    COALESCE('Content Strategy: ' || content_strategy_summary || E'\n', '') ||
    COALESCE('Ad Strategy: ' || ad_strategy_summary || E'\n', '') ||
    COALESCE('Pricing: ' || pricing_model || ' — ' || pricing_range || E'\n', '')
  INTO v_content
  FROM client_competitive_landscape
  WHERE id = p_competitor_id;

  UPDATE client_competitive_landscape
  SET content_text = v_content
  WHERE id = p_competitor_id;

  RETURN v_content;
END;
$$;

-- ============================================================
-- Helper: Prepare content_text for historical output embedding
-- ============================================================
CREATE OR REPLACE FUNCTION prepare_output_content(p_output_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_content TEXT;
BEGIN
  SELECT
    'Title: ' || title || E'\n' ||
    'Type: ' || output_type || E'\n' ||
    'Agent: ' || producing_agent || E'\n' ||
    COALESCE('Channel: ' || published_channel || E'\n', '') ||
    'Content: ' || LEFT(content, 8000) -- Truncate very long content
  INTO v_content
  FROM client_historical_outputs
  WHERE id = p_output_id;

  UPDATE client_historical_outputs
  SET content_text = v_content
  WHERE id = p_output_id;

  RETURN v_content;
END;
$$;

-- ============================================================
-- Function: generate_embedding_openai(text)
-- Calls OpenAI text-embedding-3-large via PG http extension
-- Returns vector(3072)
-- Requires: extensions.http extension enabled
-- API key set via: ALTER DATABASE postgres SET app.openai_api_key = 'sk-...';
-- ============================================================
CREATE OR REPLACE FUNCTION generate_embedding_openai(input_text text)
RETURNS vector(3072)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  api_key text;
  response extensions.http_response;
  response_json jsonb;
  embedding_array jsonb;
BEGIN
  api_key := current_setting('app.openai_api_key', true);

  IF api_key IS NULL OR api_key = '' THEN
    RAISE EXCEPTION 'OpenAI API key not configured. Set via: ALTER DATABASE postgres SET app.openai_api_key = ''sk-...'';';
  END IF;

  -- Truncate to ~8000 tokens (~32000 chars)
  input_text := LEFT(input_text, 32000);

  SELECT * INTO response FROM extensions.http((
    'POST',
    'https://api.openai.com/v1/embeddings',
    ARRAY[extensions.http_header('Authorization', 'Bearer ' || api_key)],
    'application/json',
    json_build_object(
      'model', 'text-embedding-3-large',
      'input', input_text,
      'dimensions', 3072
    )::text
  )::extensions.http_request);

  IF response.status != 200 THEN
    RAISE EXCEPTION 'OpenAI API error (status %): %', response.status, LEFT(response.content, 500);
  END IF;

  response_json := response.content::jsonb;
  embedding_array := response_json->'data'->0->'embedding';

  RETURN embedding_array::text::vector(3072);
END;
$$;

-- ============================================================
-- Function: generate_all_embeddings(client_uuid)
-- Generates embeddings for ALL Client Brain rows for a client
-- Processes: brand_books, icp_documents, voc_library, competitive_landscape
-- Returns table of results per row
-- ============================================================
CREATE OR REPLACE FUNCTION generate_all_embeddings(p_client_id uuid)
RETURNS TABLE(table_name text, row_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  emb vector(3072);
BEGIN
  -- Brand Books
  FOR rec IN SELECT id, content_text FROM client_brand_books
    WHERE client_id = p_client_id AND embedding IS NULL AND content_text IS NOT NULL
  LOOP
    BEGIN
      emb := generate_embedding_openai(rec.content_text);
      UPDATE client_brand_books SET embedding = emb WHERE id = rec.id;
      table_name := 'client_brand_books'; row_id := rec.id; status := 'OK';
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      table_name := 'client_brand_books'; row_id := rec.id; status := 'ERROR: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  -- ICP Documents
  FOR rec IN SELECT id, content_text FROM client_icp_documents
    WHERE client_id = p_client_id AND embedding IS NULL AND content_text IS NOT NULL
  LOOP
    BEGIN
      emb := generate_embedding_openai(rec.content_text);
      UPDATE client_icp_documents SET embedding = emb WHERE id = rec.id;
      table_name := 'client_icp_documents'; row_id := rec.id; status := 'OK';
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      table_name := 'client_icp_documents'; row_id := rec.id; status := 'ERROR: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  -- VOC Library
  FOR rec IN SELECT id, content_text FROM client_voc_library
    WHERE client_id = p_client_id AND embedding IS NULL AND content_text IS NOT NULL
  LOOP
    BEGIN
      emb := generate_embedding_openai(rec.content_text);
      UPDATE client_voc_library SET embedding = emb WHERE id = rec.id;
      table_name := 'client_voc_library'; row_id := rec.id; status := 'OK';
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      table_name := 'client_voc_library'; row_id := rec.id; status := 'ERROR: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  -- Competitive Landscape
  FOR rec IN SELECT id, content_text FROM client_competitive_landscape
    WHERE client_id = p_client_id AND embedding IS NULL AND content_text IS NOT NULL
  LOOP
    BEGIN
      emb := generate_embedding_openai(rec.content_text);
      UPDATE client_competitive_landscape SET embedding = emb WHERE id = rec.id;
      table_name := 'client_competitive_landscape'; row_id := rec.id; status := 'OK';
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      table_name := 'client_competitive_landscape'; row_id := rec.id; status := 'ERROR: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- ============================================================
-- DONE. All helper functions created:
--
-- Content preparation:
--   - prepare_brand_book_content(uuid) → text
--   - prepare_icp_content(uuid) → text
--   - prepare_voc_content(uuid) → text
--   - prepare_competitor_content(uuid) → text
--   - prepare_output_content(uuid) → text
--
-- Embedding generation (via PG http extension + OpenAI API):
--   - generate_embedding_openai(text) → vector(3072)
--   - generate_all_embeddings(client_uuid) → TABLE(table_name, row_id, status)
--
-- Usage flow:
--   1. Insert row into Client Brain table
--   2. Call prepare_*_content(row_id) to build content_text
--   3. Call generate_embedding_openai(content_text) or
--      generate_all_embeddings(client_id) for batch processing
--   4. Alternative: Edge Function generate-embedding (needs CLI deploy)
--
-- Setup:
--   CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
--   ALTER DATABASE postgres SET app.openai_api_key = 'sk-proj-...';
-- ============================================================
