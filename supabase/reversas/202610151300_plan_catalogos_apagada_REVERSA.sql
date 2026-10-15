-- REVERSA de 202610151300_plan_catalogos_apagada.sql · CC#1 · 2026-10-15 · NO APLICADA · GENERADA (no se edita a mano)
-- Se NIEGA a borrar si alguna tabla tiene MÁS filas que la semilla (alguien dio de alta una versión: es evidencia de uso). Con solo la semilla, borra las cinco.
-- 🔴 CUANDO LA GUARDA SALTA, ESTE ARCHIVO DEJA SU TRANSACCIÓN ABIERTA (el BEGIN no llega a su COMMIT): en una SESIÓN INTERACTIVA hace falta un ROLLBACK a mano.
--    Ejecutado como UN solo envío (API de administración, `psql -f`) no importa: la conexión se cierra y la transacción se deshace sola.
BEGIN;

DO $plan_catalogos_reversa$
DECLARE
  n integer := 0;
  extras text := '';
BEGIN
  IF to_regclass('public.plan_catalogo_fuentes') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.plan_catalogo_fuentes' INTO n;
    IF n > 10 THEN extras := extras || format('plan_catalogo_fuentes=%s ', n); END IF;
  END IF;
  IF to_regclass('public.plan_catalogo_tipos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.plan_catalogo_tipos' INTO n;
    IF n > 16 THEN extras := extras || format('plan_catalogo_tipos=%s ', n); END IF;
  END IF;
  IF to_regclass('public.plan_catalogo_reglas') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.plan_catalogo_reglas' INTO n;
    IF n > 17 THEN extras := extras || format('plan_catalogo_reglas=%s ', n); END IF;
  END IF;
  IF to_regclass('public.plan_catalogo_lexico') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.plan_catalogo_lexico' INTO n;
    IF n > 5 THEN extras := extras || format('plan_catalogo_lexico=%s ', n); END IF;
  END IF;
  IF to_regclass('public.plan_catalogo_topes') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.plan_catalogo_topes' INTO n;
    IF n > 5 THEN extras := extras || format('plan_catalogo_topes=%s ', n); END IF;
  END IF;
  IF extras <> '' THEN
    RAISE EXCEPTION 'plan_catalogo_*: hay filas propias (% ); no se borra. Si usas una sesión interactiva, ROLLBACK.', extras;
  END IF;
END
$plan_catalogos_reversa$;

DROP TABLE IF EXISTS public.plan_catalogo_fuentes;
DROP TABLE IF EXISTS public.plan_catalogo_tipos;
DROP TABLE IF EXISTS public.plan_catalogo_reglas;
DROP TABLE IF EXISTS public.plan_catalogo_lexico;
DROP TABLE IF EXISTS public.plan_catalogo_topes;

COMMIT;

NOTIFY pgrst, 'reload schema';
