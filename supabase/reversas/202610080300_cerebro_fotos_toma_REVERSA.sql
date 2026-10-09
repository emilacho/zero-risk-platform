-- REVERSA de las 3 columnas de la toma de las fotos · CC#1 · 2026-10-08 · deja `client_social_images` IDÉNTICA a antes.
-- 🔴 SE NIEGA A BORRAR DATOS: si alguna de las 3 columnas ya tiene datos, ABORTA con error y no borra nada. En ese caso: primero EXPORTAR (copia de las filas) y recién entonces decidir.
-- 🔴 NO va en `supabase/migrations/` (una herramienta de migraciones la correría sola): vive en `supabase/reversas/`.
-- Quitar una columna quita también su restricción de valores (es de esa columna). Una sola transacción.
BEGIN;
DO $guarda$
DECLARE
  n bigint;
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['con_personas','tipo_de_toma','formato'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_social_images' AND column_name = col) THEN
      EXECUTE format('SELECT count(*) FROM public.client_social_images WHERE %I IS NOT NULL', col) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: client_social_images.% tiene % filas con dato. Exportar antes de borrar.', col, n; END IF;
    END IF;
  END LOOP;
END
$guarda$;
ALTER TABLE public.client_social_images
  DROP COLUMN IF EXISTS con_personas,
  DROP COLUMN IF EXISTS tipo_de_toma,
  DROP COLUMN IF EXISTS formato;
COMMIT;
NOTIFY pgrst, 'reload schema';
