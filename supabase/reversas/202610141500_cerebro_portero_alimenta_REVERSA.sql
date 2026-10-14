-- REVERSA de 202610141500_cerebro_portero_alimenta.sql · quita las 2 tablas NUEVAS, las 6 columnas NUEVAS de `cerebro_fichas` y devuelve el CHECK de `client_brain_chunks`.
-- 🔴 SE NIEGA A BORRAR DATOS: aborta con error si (a) alguna tabla nueva tiene filas, (b) alguna ficha usa una columna nueva, (c) hay trozos del índice con source_table='cerebro_fichas'. Primero EXPORTAR.
-- 🔴 NO va en `supabase/migrations/`. Una sola transacción.
BEGIN;
DO $guarda$
DECLARE n bigint; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cerebro_unidades_vistas','cerebro_portero_corridas'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % tiene % filas. Exportar antes de borrar.', t, n; END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cerebro_fichas' AND column_name='atributo') THEN
    EXECUTE 'SELECT count(*) FROM public.cerebro_fichas WHERE fuente_url IS NOT NULL OR observado_en IS NOT NULL OR atributo IS NOT NULL OR decision IS NOT NULL OR razon_de_decision IS NOT NULL OR reemplazada_por IS NOT NULL' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % fichas usan columnas nuevas. Exportar antes de borrar.', n; END IF;
  END IF;
  SELECT count(*) INTO n FROM public.client_brain_chunks WHERE source_table = 'cerebro_fichas';
  IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % trozos del índice vienen de cerebro_fichas. Exportar antes de borrar.', n; END IF;
END
$guarda$;
DROP TABLE IF EXISTS public.cerebro_unidades_vistas;
DROP TABLE IF EXISTS public.cerebro_portero_corridas;
DROP INDEX IF EXISTS public.cerebro_fichas_por_atributo;
ALTER TABLE public.cerebro_fichas DROP CONSTRAINT IF EXISTS cerebro_fichas_decision_valida;
ALTER TABLE public.cerebro_fichas
  DROP COLUMN IF EXISTS reemplazada_por, DROP COLUMN IF EXISTS razon_de_decision, DROP COLUMN IF EXISTS decision,
  DROP COLUMN IF EXISTS atributo, DROP COLUMN IF EXISTS observado_en, DROP COLUMN IF EXISTS fuente_url;
DO $chk$
DECLARE nombre text;
BEGIN
  SELECT conname INTO nombre FROM pg_constraint WHERE conrelid = 'public.client_brain_chunks'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%source_table%' LIMIT 1;
  IF nombre IS NOT NULL THEN EXECUTE format('ALTER TABLE public.client_brain_chunks DROP CONSTRAINT %I', nombre); END IF;
  ALTER TABLE public.client_brain_chunks ADD CONSTRAINT client_brain_chunks_source_table_check CHECK (source_table IN (
    'client_brand_books','client_icp_documents','client_voc_library','client_competitive_landscape','client_historical_outputs','client_web_pages'));
END
$chk$;
NOTIFY pgrst, 'reload schema';
COMMIT;
