-- Sprint-brain §144 · FASE A · A4 · drift de tipo en client_brain_snapshots
-- 2026-06-27 · CC#1 · branch/shadow · NO aplicar a prod sin §144 (R10 single-file)
--
-- Problema (CC#1 audit 2026-06-09) · `client_brain_snapshots.client_id` es
-- `text` mientras TODAS las otras tablas brain usan `uuid`. Riesgo de joins
-- con cast implícito + bugs sutiles. Tabla con 0 rows (verificado · §148) →
-- el ALTER es trivialmente seguro.
--
-- Defensivo · solo altera si la columna existe y NO es ya uuid. Idempotente.

BEGIN;

DO $$
DECLARE
  v_type text;
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
    -- 0 rows → el USING cast no se ejecuta sobre datos. Si hubiera filas con
    -- client_id no-uuid, esto fallaría (deseado · fail-loud antes que corromper).
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
