-- REVERSA de 202610141900_finanzas_conversa_apagada.sql · CC#1 · 2026-10-14 · NO APLICADA
-- Se NIEGA a borrar si hay encargos (evidencia de uso): en ese caso se apaga la conversación (UPDATE finanzas_config SET conversa = 'apagado') y se conservan las tablas.
-- Solo borra las 3 tablas nuevas; no toca ninguna otra.
-- 🔴 CUANDO LA GUARDA SALTA, ESTE ARCHIVO DEJA SU TRANSACCIÓN ABIERTA (el BEGIN no llega a su COMMIT): en una SESIÓN INTERACTIVA hace falta un ROLLBACK a mano.
--    Ejecutado como UN solo envío (API de administración, `psql -f`) no importa: la conexión se cierra y la transacción se deshace sola.
BEGIN;

DO $finanzas_conversa_reversa$
DECLARE
  n_encargos integer := 0;
BEGIN
  IF to_regclass('public.finanzas_encargos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.finanzas_encargos' INTO n_encargos;
  END IF;
  IF n_encargos > 0 THEN
    RAISE EXCEPTION 'finanzas_conversa: hay % encargo(s); no se borra. Apaga con UPDATE finanzas_config SET conversa = ''apagado'' y, si usas una sesión interactiva, ROLLBACK.', n_encargos;
  END IF;
END
$finanzas_conversa_reversa$;

DROP TABLE IF EXISTS public.finanzas_artefactos;
DROP TABLE IF EXISTS public.finanzas_turnos;
DROP TABLE IF EXISTS public.finanzas_encargos;

COMMIT;

NOTIFY pgrst, 'reload schema';
