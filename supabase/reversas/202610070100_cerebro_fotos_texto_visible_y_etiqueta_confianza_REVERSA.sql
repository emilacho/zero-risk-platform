-- REVERSA de las 2 columnas de fotos del cerebro · CC#2 · 2026-10-07 · deja `client_social_images` IDÉNTICA a antes (probada en una copia del esquema: ver raw/evidencia/2026-10-07-MIGRACION-2-COLUMNAS-FOTOS/).
-- 🔴 SE NIEGA A BORRAR DATOS: si alguna de las 2 columnas ya tiene datos, ABORTA con error y no borra nada. En ese caso: primero EXPORTAR (copia de las filas) y recién entonces decidir.
-- 🔴 NO va en `supabase/migrations/` (una herramienta de migraciones la correría sola): vive en `supabase/reversas/`.
-- Quitar la columna `etiqueta_confianza` quita también su restricción de valores (es de esa columna). Una sola transacción.
BEGIN;
DO $guarda$
DECLARE
  n bigint;
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['texto_visible','etiqueta_confianza'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_social_images' AND column_name = col) THEN
      EXECUTE format('SELECT count(*) FROM public.client_social_images WHERE %I IS NOT NULL', col) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: client_social_images.% tiene % filas con dato. Exportar antes de borrar.', col, n; END IF;
    END IF;
  END LOOP;
END
$guarda$;
ALTER TABLE public.client_social_images
  DROP COLUMN IF EXISTS texto_visible,
  DROP COLUMN IF EXISTS etiqueta_confianza;
COMMIT;
NOTIFY pgrst, 'reload schema';
