-- 202611190700 · JUNTAR PÚBLICOS EN EL ALTA · entrega 1 · CC1 · certifica CC6 · US$ 0
-- Contrato con CC-CEREBRO (18-nov 14:43Z, `RESPUESTA-LENOVO-a-CEREBRO-CC-CEREBRO-CC1-relevancia-y-publicos.md`): 5 columnas en `client_icp_documents`.
--   · fusionado_en         → el público que lo ABSORBIÓ («mismo»). VIGENTE = fusionado_en IS NULL.
--   · posible_duplicado_de → «en duda»: los dos siguen vigentes; los lectores agrupan por esta columna.
--   · segmento_de          → «uno dentro de otro»: el específico queda como segmento del general y sigue vigente.
--   · fusion_porque        → la nota del agente que decidió.
--   · fusion_fuentes       → las fuentes y fechas que se juntaron (lista).
-- Solo AGREGA columnas: ninguna fila cambia (todas quedan vigentes, como hoy). Un ALTER no dispara el AFTER UPDATE `icp_documents_brain_reembed`.
-- Reversa: reversas/202611190700_publicos_columnas_de_fusion_REVERSA.sql
BEGIN;

ALTER TABLE public.client_icp_documents
  ADD COLUMN IF NOT EXISTS fusionado_en uuid NULL REFERENCES public.client_icp_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS posible_duplicado_de uuid NULL REFERENCES public.client_icp_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS segmento_de uuid NULL REFERENCES public.client_icp_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fusion_porque text NULL,
  ADD COLUMN IF NOT EXISTS fusion_fuentes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- un público no apunta a sí mismo, y un absorbido no es a la vez segmento ni duda de otro
ALTER TABLE public.client_icp_documents
  ADD CONSTRAINT client_icp_documents_fusion_no_a_si_mismo CHECK (
    (fusionado_en IS NULL OR fusionado_en <> id)
    AND (posible_duplicado_de IS NULL OR posible_duplicado_de <> id)
    AND (segmento_de IS NULL OR segmento_de <> id)
  ),
  ADD CONSTRAINT client_icp_documents_absorbido_sin_otra_marca CHECK (
    fusionado_en IS NULL OR (posible_duplicado_de IS NULL AND segmento_de IS NULL)
  ),
  ADD CONSTRAINT client_icp_documents_fusion_fuentes_es_lista CHECK (jsonb_typeof(fusion_fuentes) = 'array');

-- los lectores piden «los vigentes de un cliente»
CREATE INDEX IF NOT EXISTS idx_client_icp_documents_vigentes ON public.client_icp_documents (client_id) WHERE fusionado_en IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_icp_documents'
      AND column_name IN ('fusionado_en', 'posible_duplicado_de', 'segmento_de', 'fusion_porque', 'fusion_fuentes')) <> 5 THEN
    RAISE EXCEPTION '202611190700: no quedaron las 5 columnas de fusión';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_icp_documents WHERE fusionado_en IS NOT NULL OR posible_duplicado_de IS NOT NULL OR segmento_de IS NOT NULL) THEN
    RAISE EXCEPTION '202611190700: alguna fila quedó marcada; esta migración no marca ninguna';
  END IF;
END $$;

COMMIT;
