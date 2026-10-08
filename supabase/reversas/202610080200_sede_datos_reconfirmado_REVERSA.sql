-- REVERSA de `client_sede_datos.reconfirmado_en` · CC#1 · 2026-10-08 · deja la tabla IDÉNTICA a antes.
-- 🔴 SE NIEGA A BORRAR DATOS: si la columna ya tiene filas con dato, ABORTA con error y no borra nada. Primero EXPORTAR, y recién entonces decidir.
-- 🔴 NO va en `supabase/migrations/`: vive en `supabase/reversas/`.
BEGIN;
DO $guarda$
DECLARE n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_sede_datos' AND column_name = 'reconfirmado_en') THEN
    SELECT count(*) INTO n FROM public.client_sede_datos WHERE reconfirmado_en IS NOT NULL;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: client_sede_datos.reconfirmado_en tiene % filas con dato. Exportar antes de borrar.', n; END IF;
  END IF;
END
$guarda$;
ALTER TABLE public.client_sede_datos DROP COLUMN IF EXISTS reconfirmado_en;
COMMIT;
NOTIFY pgrst, 'reload schema';
