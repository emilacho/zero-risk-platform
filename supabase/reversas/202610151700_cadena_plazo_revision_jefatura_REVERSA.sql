-- REVERSA de 202610151700_cadena_plazo_revision_jefatura.sql · CC#1 · 2026-10-15 · NO APLICADA
-- Se NIEGA a borrar si hay esperas de este tipo (evidencia de uso y la FK a `cadena_plazos(tipo)` las referencia).
-- 🔴 CUANDO LA GUARDA SALTA, ESTE ARCHIVO DEJA SU TRANSACCIÓN ABIERTA: en una SESIÓN INTERACTIVA hace falta un ROLLBACK a mano.
BEGIN;

DO $revision_jefatura_reversa$
DECLARE
  n integer := 0;
BEGIN
  IF to_regclass('public.cadena_esperas') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cadena_esperas WHERE objeto_tipo = ''revision_jefatura''' INTO n;
  END IF;
  IF n > 0 THEN
    RAISE EXCEPTION 'cadena_esperas: hay % espera(s) de revision_jefatura; no se borra el plazo. Si usas una sesión interactiva, ROLLBACK.', n;
  END IF;
END
$revision_jefatura_reversa$;

DELETE FROM public.cadena_plazos WHERE tipo = 'revision_jefatura';

COMMIT;

NOTIFY pgrst, 'reload schema';
