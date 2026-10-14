-- 202610141500 · EL PORTERO QUE ALIMENTA (firma 14-oct de Emilio) · ESCRITA, NO APLICADA. Se aplica con «dale», después de la jefatura.
-- ADITIVA: 2 tablas nuevas + 6 columnas nuevas en `cerebro_fichas` + el CHECK de `client_brain_chunks.source_table` ensanchado con `cerebro_fichas` (el puente al índice).
-- 🔴 Nada se borra: ninguna fila existente cambia. Las fichas nuevas son las únicas que usan las columnas nuevas (nulas en las viejas).
-- 🔴 La lección del proyecto: CREATE TABLE no alcanza. Cada tabla nueva lleva en la MISMA migración RLS + REVOKE a anon/authenticated + GRANT a service_role + política de servicio.
-- 🔴 IDEMPOTENTE. Una sola transacción. `client_id` es TEXTO (igual que las demás tablas del cerebro).
-- REVERSA: `supabase/reversas/202610141500_cerebro_portero_alimenta_REVERSA.sql` (se NIEGA a borrar si hay filas).

BEGIN;

-- ───────────────────────── 1 · cerebro_unidades_vistas · lo que ya se vio (y qué se hizo con ello) para no volver a pagarlo ni a juzgarlo
CREATE TABLE IF NOT EXISTS public.cerebro_unidades_vistas (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    text        NOT NULL,
  fuente       text        NOT NULL,
  unidad_ref   text        NOT NULL,
  huella       text        NOT NULL,
  veredicto    text        NOT NULL,
  ficha_id     uuid        REFERENCES public.cerebro_fichas(id),
  primera_vez  timestamptz NOT NULL DEFAULT now(),
  ultima_vez   timestamptz NOT NULL DEFAULT now(),
  prueba       boolean     NOT NULL DEFAULT false,
  CONSTRAINT cerebro_unidades_vistas_veredicto_valido CHECK (veredicto IN ('suma','reemplaza','nada','duda','sin_confirmar','ajeno','ruido','repetida'))
);
CREATE UNIQUE INDEX IF NOT EXISTS cerebro_unidades_vistas_una ON public.cerebro_unidades_vistas (client_id, fuente, unidad_ref, huella);
CREATE INDEX IF NOT EXISTS cerebro_unidades_vistas_por_cliente ON public.cerebro_unidades_vistas (client_id, ultima_vez DESC);

-- ───────────────────────── 2 · cerebro_portero_corridas · el rastro de cada día por cliente (qué pidió, qué entró, qué costó)
CREATE TABLE IF NOT EXISTS public.cerebro_portero_corridas (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              text          NOT NULL,
  dia                    date          NOT NULL,
  estado                 text          NOT NULL,
  resumen                jsonb         NOT NULL DEFAULT '{}'::jsonb,
  gasto_apify_usd        numeric(14,6) NOT NULL DEFAULT 0,
  gasto_modelo_usd       numeric(14,6) NOT NULL DEFAULT 0,
  workflow_id            text,
  workflow_execution_id  text,
  creado_en              timestamptz   NOT NULL DEFAULT now(),
  prueba                 boolean       NOT NULL DEFAULT false,
  CONSTRAINT cerebro_portero_corridas_estado_valido CHECK (estado IN ('hecha','con_errores','parcial')),
  CONSTRAINT cerebro_portero_corridas_una_por_dia UNIQUE (client_id, dia)
);

-- ───────────────────────── 3 · columnas nuevas de las fichas (nulas en las viejas)
ALTER TABLE public.cerebro_fichas
  ADD COLUMN IF NOT EXISTS fuente_url         text,
  ADD COLUMN IF NOT EXISTS observado_en       timestamptz,
  ADD COLUMN IF NOT EXISTS atributo           text,
  ADD COLUMN IF NOT EXISTS decision           text,
  ADD COLUMN IF NOT EXISTS razon_de_decision  text,
  ADD COLUMN IF NOT EXISTS reemplazada_por    uuid REFERENCES public.cerebro_fichas(id);
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cerebro_fichas'::regclass AND conname = 'cerebro_fichas_decision_valida') THEN
    ALTER TABLE public.cerebro_fichas ADD CONSTRAINT cerebro_fichas_decision_valida CHECK (decision IS NULL OR decision IN ('suma','reemplaza','duda'));
  END IF;
END
$chk$;
CREATE INDEX IF NOT EXISTS cerebro_fichas_por_atributo ON public.cerebro_fichas (client_id, atributo) WHERE atributo IS NOT NULL AND retirada_en IS NULL;

-- ───────────────────────── 4 · permisos (sin esto PostgREST no las ve)
ALTER TABLE public.cerebro_unidades_vistas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_portero_corridas  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cerebro_unidades_vistas, public.cerebro_portero_corridas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cerebro_unidades_vistas, public.cerebro_portero_corridas TO service_role;
DO $pol$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cerebro_unidades_vistas','cerebro_portero_corridas'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || t)::regclass AND polname = t || '_service') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    END IF;
  END LOOP;
END
$pol$;

-- ───────────────────────── 5 · el puente al índice: `client_brain_chunks.source_table` acepta `cerebro_fichas` (lo que el portero archiva llega a quien lee el cerebro)
DO $puente$
DECLARE nombre text;
BEGIN
  SELECT conname INTO nombre FROM pg_constraint
   WHERE conrelid = 'public.client_brain_chunks'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%source_table%' LIMIT 1;
  IF nombre IS NOT NULL THEN EXECUTE format('ALTER TABLE public.client_brain_chunks DROP CONSTRAINT %I', nombre); END IF;
  ALTER TABLE public.client_brain_chunks ADD CONSTRAINT client_brain_chunks_source_table_check CHECK (source_table IN (
    'client_brand_books','client_icp_documents','client_voc_library','client_competitive_landscape','client_historical_outputs','client_web_pages','cerebro_fichas'));
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.client_brain_chunks'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%source_table%') <> 1 THEN
    RAISE EXCEPTION 'quedó más de un CHECK sobre source_table';
  END IF;
END
$puente$;

COMMENT ON TABLE public.cerebro_unidades_vistas  IS 'CEREBRO · portero que alimenta · cada cosa suelta que ya se vio (huella) y qué se hizo con ella. Solo la tocan /api/brain/alimentar/procesar.';
COMMENT ON TABLE public.cerebro_portero_corridas IS 'CEREBRO · portero que alimenta · rastro por cliente y día. Una por día (forzar la repite).';

COMMIT;

NOTIFY pgrst, 'reload schema';
