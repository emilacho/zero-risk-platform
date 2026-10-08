-- REVERSA de los recados de la sala (paso 1) · CC#1 · 2026-10-08 · deja el esquema IDÉNTICO a antes.
-- 🔴 SE NIEGA A BORRAR DATOS: si `sala_recados` tiene alguna fila, o `sala_destinos_de_recado` tiene algún destino que NO sea de la siembra de la migración, ABORTA con error y no borra nada. En ese caso: primero EXPORTAR (copia de las filas) y recién entonces decidir.
-- 🔴 NO va en `supabase/migrations/` (una herramienta de migraciones la correría sola): vive en `supabase/reversas/`.
-- Orden: primero los recados (apuntan a los destinos), luego los destinos. Una sola transacción.
BEGIN;
DO $guarda$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public.sala_recados') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.sala_recados' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: sala_recados tiene % filas. Exportar antes de borrar.', n; END IF;
  END IF;
  IF to_regclass('public.sala_destinos_de_recado') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.sala_destinos_de_recado WHERE destino <> ALL (ARRAY[''apify'',''audio'',''correo'',''dataforseo'',''dueno'',''etiquetar'',''imagen'',''loyverse'',''video''])' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: sala_destinos_de_recado tiene % destinos añadidos después de la migración. Exportar antes de borrar.', n; END IF;
  END IF;
END
$guarda$;
DROP TABLE IF EXISTS public.sala_recados;
DROP TABLE IF EXISTS public.sala_destinos_de_recado;
COMMIT;
NOTIFY pgrst, 'reload schema';
