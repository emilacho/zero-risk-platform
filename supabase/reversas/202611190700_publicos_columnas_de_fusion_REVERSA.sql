-- REVERSA de 202611190700 · quita las 5 columnas de fusión de `client_icp_documents`.
-- Se niega si alguna fila ya está marcada (perdería qué público absorbió a cuál): primero hay que deshacer la fusión.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.client_icp_documents WHERE fusionado_en IS NOT NULL OR posible_duplicado_de IS NOT NULL OR segmento_de IS NOT NULL) THEN
    RAISE EXCEPTION 'REVERSA 202611190700: hay públicos marcados (fusión, segmento o duda); deshacer la fusión antes';
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_client_icp_documents_vigentes;
ALTER TABLE public.client_icp_documents
  DROP CONSTRAINT IF EXISTS client_icp_documents_fusion_no_a_si_mismo,
  DROP CONSTRAINT IF EXISTS client_icp_documents_absorbido_sin_otra_marca,
  DROP CONSTRAINT IF EXISTS client_icp_documents_fusion_fuentes_es_lista,
  DROP COLUMN IF EXISTS fusion_fuentes,
  DROP COLUMN IF EXISTS fusion_porque,
  DROP COLUMN IF EXISTS segmento_de,
  DROP COLUMN IF EXISTS posible_duplicado_de,
  DROP COLUMN IF EXISTS fusionado_en;

COMMIT;
