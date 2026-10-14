-- REVERSA de 202610141800_finanzas_oficina_apagada.sql · CC#1 · 2026-10-14 · NO APLICADA
-- Se NIEGA a borrar si hay tableros, preguntas, REFERENCIAS o PESOS POR RUBRO (evidencia de uso o trabajo caro de rehacer: la oficina siembra las referencias con fuente y fecha):
-- en ese caso se apaga la oficina (UPDATE finanzas_config SET estado = 'apagada') y se conservan las tablas.
-- Solo borra las 8 tablas nuevas; no toca ninguna otra.
-- 🔴 CUANDO LA GUARDA SALTA, ESTE ARCHIVO DEJA SU TRANSACCIÓN ABIERTA (el BEGIN de arriba no llega a su COMMIT): en una SESIÓN INTERACTIVA hace falta un ROLLBACK a mano.
--    Ejecutado como UN solo envío (API de administración, `psql -f`) no importa: la conexión se cierra y la transacción se deshace sola.
BEGIN;

DO $finanzas_reversa$
DECLARE
  n_tableros integer := 0;
  n_preguntas integer := 0;
  n_referencias integer := 0;
  n_pesos integer := 0;
BEGIN
  IF to_regclass('public.finanzas_tableros') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.finanzas_tableros' INTO n_tableros;
  END IF;
  IF to_regclass('public.finanzas_preguntas') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.finanzas_preguntas' INTO n_preguntas;
  END IF;
  IF to_regclass('public.finanzas_referencias') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.finanzas_referencias' INTO n_referencias;
  END IF;
  IF to_regclass('public.finanzas_canales_por_rubro') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.finanzas_canales_por_rubro' INTO n_pesos;
  END IF;
  IF n_tableros > 0 OR n_preguntas > 0 OR n_referencias > 0 OR n_pesos > 0 THEN
    RAISE EXCEPTION 'finanzas: hay % tablero(s), % pregunta(s), % referencia(s) y % peso(s) por rubro; no se borra. Apaga la oficina con UPDATE finanzas_config SET estado = ''apagada'' y, si usas una sesión interactiva, ROLLBACK.', n_tableros, n_preguntas, n_referencias, n_pesos;
  END IF;
END
$finanzas_reversa$;

DROP TABLE IF EXISTS public.finanzas_numeros;
DROP TABLE IF EXISTS public.finanzas_tableros;
DROP TABLE IF EXISTS public.finanzas_preguntas;
DROP TABLE IF EXISTS public.finanzas_canales_por_rubro;
DROP TABLE IF EXISTS public.finanzas_referencias;
DROP TABLE IF EXISTS public.finanzas_canales;
DROP TABLE IF EXISTS public.finanzas_eventos;
DROP TABLE IF EXISTS public.finanzas_config;

COMMIT;
NOTIFY pgrst, 'reload schema';
