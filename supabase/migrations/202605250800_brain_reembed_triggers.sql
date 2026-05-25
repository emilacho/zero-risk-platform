-- Sprint 8D · Brain RAG Gap 3 · UPDATE triggers para real-time re-embed.
--
-- Function `brain_reembed_source_row` invokes pg_net.http_post a
-- /api/brain/reembed-source-row · which fetches the source row · extracts
-- sections · invokes /api/brain/ingest-source canonical. Result · brain
-- chunks update en tiempo real (vs 24h daily cron Gap 1).
--
-- Settings requeridos (via Supabase project Database → Settings → Custom
-- Postgres config) ·
--   ALTER DATABASE postgres SET app.zero_risk_api_url = 'https://zero-risk-platform.vercel.app';
--   ALTER DATABASE postgres SET app.internal_api_key = '<value-from-vault>';
--
-- Si las settings NO están configuradas · trigger emite RAISE NOTICE pero
-- NO falla · UPDATE proceeds normally · gap es silent skip (no real-time
-- re-embed pero Gap 1 daily cron picks it up al día siguiente · canonical).
--
-- pg_net extension viene built-in con Supabase Pro · si NO está disponible ·
-- CREATE EXTENSION fails · CIC2 reportar honest · fallback solo Gap 1 cron.

BEGIN;

-- Enable pg_net (Supabase Pro default · idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function · invoke webhook canonical
CREATE OR REPLACE FUNCTION brain_reembed_source_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_internal_key text;
  v_request_id bigint;
BEGIN
  v_url := current_setting('app.zero_risk_api_url', true);
  v_internal_key := current_setting('app.internal_api_key', true);

  IF v_url IS NULL OR v_internal_key IS NULL THEN
    RAISE NOTICE '[brain_reembed_source_row] app.zero_risk_api_url or app.internal_api_key not configured · skip · daily cron will reindex within 24h';
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP POST · pg_net returns request_id · doesn't block UPDATE
  SELECT INTO v_request_id
    net.http_post(
      url := v_url || '/api/brain/reembed-source-row',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-api-key', v_internal_key
      ),
      body := jsonb_build_object(
        'source_table', TG_TABLE_NAME,
        'source_id', NEW.id::text,
        'client_id', NEW.client_id::text,
        'updated_at', NEW.updated_at::text
      )
    );

  RAISE NOTICE '[brain_reembed_source_row] queued request_id=% for table=% source_id=%', v_request_id, TG_TABLE_NAME, NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION brain_reembed_source_row IS
  'Sprint 8D · invoked by AFTER UPDATE triggers on brand_books · icp_documents · voc_library · competitive_landscape · fires async webhook to /api/brain/reembed-source-row · graceful skip si settings missing';

-- Triggers · AFTER UPDATE per source table (drop + recreate for idempotency)
DROP TRIGGER IF EXISTS brand_books_brain_reembed ON client_brand_books;
CREATE TRIGGER brand_books_brain_reembed
  AFTER UPDATE ON client_brand_books
  FOR EACH ROW
  EXECUTE FUNCTION brain_reembed_source_row();

DROP TRIGGER IF EXISTS icp_documents_brain_reembed ON client_icp_documents;
CREATE TRIGGER icp_documents_brain_reembed
  AFTER UPDATE ON client_icp_documents
  FOR EACH ROW
  EXECUTE FUNCTION brain_reembed_source_row();

DROP TRIGGER IF EXISTS competitive_landscape_brain_reembed ON client_competitive_landscape;
CREATE TRIGGER competitive_landscape_brain_reembed
  AFTER UPDATE ON client_competitive_landscape
  FOR EACH ROW
  EXECUTE FUNCTION brain_reembed_source_row();

DROP TRIGGER IF EXISTS voc_library_brain_reembed ON client_voc_library;
CREATE TRIGGER voc_library_brain_reembed
  AFTER UPDATE ON client_voc_library
  FOR EACH ROW
  EXECUTE FUNCTION brain_reembed_source_row();

COMMIT;
