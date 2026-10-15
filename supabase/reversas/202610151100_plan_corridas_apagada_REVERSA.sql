-- REVERSA de 202610151100_plan_corridas_apagada.sql · CC#2 · 2026-10-15 · NO APLICADA
-- Se NIEGA a borrar si hay filas (evidencia de uso): en ese caso se conserva la tabla.
-- 🔴 CUANDO LA GUARDA SALTA, ESTE ARCHIVO DEJA SU TRANSACCIÓN ABIERTA (el BEGIN no llega a su COMMIT): en una SESIÓN INTERACTIVA hace falta un ROLLBACK a mano.
--    Ejecutado como UN solo envío (API de administración, `psql -f`) no importa: la conexión se cierra y la transacción se deshace sola.
BEGIN;

DO $plan_corridas_reversa$
DECLARE
  n integer := 0;
BEGIN
  IF to_regclass('public.plan_corridas') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.plan_corridas' INTO n;
  END IF;
  IF n > 0 THEN
    RAISE EXCEPTION 'plan_corridas: hay % fila(s); no se borra. Si usas una sesión interactiva, ROLLBACK.', n;
  END IF;
END
$plan_corridas_reversa$;

DROP TABLE IF EXISTS public.plan_corridas;

COMMIT;

NOTIFY pgrst, 'reload schema';
