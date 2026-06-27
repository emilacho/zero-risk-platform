-- Sprint-brain §144 · FASE A · A4 · drift de tipo en client_brain_snapshots
-- 2026-06-27 · CC#1 · branch/shadow · NO aplicar a prod sin §144 (R10 single-file)
--
-- Problema (CC#1 audit 2026-06-09) · `client_brain_snapshots.client_id` es
-- `text` mientras TODAS las otras tablas brain usan `uuid`. Riesgo de joins
-- con cast implícito + bugs sutiles. Tabla con 0 rows (verificado · §148) →
-- el ALTER es trivialmente seguro.
--
-- Defensivo · solo altera si la columna existe y NO es ya uuid. Idempotente.
--
-- ⚠️ Ground-truth §148 (2026-06-27 · aplicación) · la tabla NO estaba en 0 rows ·
-- 114 filas · 112 con client_id NO-uuid · TODAS `snapshot_type='rag_query_log'`
-- con client_ids de prueba (smoke-test ×106 · deploy-probe · zero-risk-ecuador ·
-- *-test-hitl · etc · Abr 20 – May 2). Son LOGS de observabilidad del stub viejo
-- de rag-search · cero valor analítico (el stub devolvía vacío) · no son datos de
-- cliente. Se purgan antes del ALTER (solo filas no-uuid · solo rag_query_log).

BEGIN;

DO $$
DECLARE
  v_type text;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_purged int;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'client_brain_snapshots'
    AND column_name = 'client_id';

  IF v_type IS NULL THEN
    RAISE NOTICE 'client_brain_snapshots.client_id no existe · skip';
  ELSIF v_type = 'uuid' THEN
    RAISE NOTICE 'client_brain_snapshots.client_id ya es uuid · skip';
  ELSE
    -- 1 · purgar SOLO logs de prueba no-uuid (rag_query_log junk · no clientes).
    --     Scope estricto · NO toca filas con client_id uuid-shaped (clientes reales).
    EXECUTE format(
      'DELETE FROM client_brain_snapshots WHERE snapshot_type = ''rag_query_log'' AND client_id !~ %L',
      v_uuid_re
    );
    GET DIAGNOSTICS v_purged = ROW_COUNT;
    RAISE NOTICE 'purgados % logs de prueba no-uuid', v_purged;

    -- 2 · si quedara CUALQUIER fila no-uuid (no rag_query_log) · fail-loud.
    IF EXISTS (SELECT 1 FROM client_brain_snapshots WHERE client_id !~ v_uuid_re) THEN
      RAISE EXCEPTION 'quedan filas con client_id no-uuid fuera de rag_query_log · revisar manual antes de ALTER';
    END IF;

    -- 3 · ALTER seguro.
    EXECUTE 'ALTER TABLE client_brain_snapshots
             ALTER COLUMN client_id TYPE uuid USING client_id::uuid';
    RAISE NOTICE 'client_brain_snapshots.client_id % → uuid', v_type;
  END IF;
END $$;

COMMIT;

-- NOTA A4 (doc-fix) · el plan menciona corregir doc `/api/brain/query` →
-- `/api/client-brain/query`. Verificado 2026-06-27 · NO existe ninguna
-- referencia a `/api/brain/query` en código ni docs del repo (el endpoint
-- canónico siempre fue `/api/client-brain/query`). Sin cambio de código necesario.
