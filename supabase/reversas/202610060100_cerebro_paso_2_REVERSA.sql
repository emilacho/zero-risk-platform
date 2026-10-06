-- REVERSA del paso 2 del cerebro · CC#1 · 2026-10-06 · deja el esquema IDÉNTICO a antes (probada en una copia del esquema: ver raw/evidencia/2026-10-06-CRUCES-PASO-2/reversa.mjs).
-- 🔴 SE NIEGA A BORRAR DATOS: si alguna de las dos tablas nuevas o alguna de las 4 columnas ya tiene datos, ABORTA con error y no borra nada. En ese caso: primero EXPORTAR (copia de las filas) y recién entonces decidir.
-- 🔴 NO va en `supabase/migrations/` (una herramienta de migraciones la correría sola): vive en `supabase/reversas/`.
-- Orden: primero las fichas (apuntan a los ingresos), luego los ingresos, luego las 4 columnas. Una sola transacción.
BEGIN;
DO $guarda$
DECLARE
  n bigint;
  col text;
BEGIN
  IF to_regclass('public.cerebro_fichas') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cerebro_fichas' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: cerebro_fichas tiene % filas. Exportar antes de borrar.', n; END IF;
  END IF;
  IF to_regclass('public.cerebro_ingresos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cerebro_ingresos' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: cerebro_ingresos tiene % filas. Exportar antes de borrar.', n; END IF;
  END IF;
  FOREACH col IN ARRAY ARRAY['que_muestra','producto_visto','etiquetada_en','etiqueta_modelo'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_social_images' AND column_name = col) THEN
      EXECUTE format('SELECT count(*) FROM public.client_social_images WHERE %I IS NOT NULL', col) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: client_social_images.% tiene % filas con dato. Exportar antes de borrar.', col, n; END IF;
    END IF;
  END LOOP;
END
$guarda$;
DROP TABLE IF EXISTS public.cerebro_fichas;
DROP TABLE IF EXISTS public.cerebro_ingresos;
ALTER TABLE public.client_social_images
  DROP COLUMN IF EXISTS que_muestra,
  DROP COLUMN IF EXISTS producto_visto,
  DROP COLUMN IF EXISTS etiquetada_en,
  DROP COLUMN IF EXISTS etiqueta_modelo;
COMMIT;
NOTIFY pgrst, 'reload schema';
