-- REVERSA de 202610312001_cadena_brief_creativo_y_conceptos.sql · CC#1 · 2026-10-31 · NO APLICADA
-- Se NIEGA si hay evidencia de uso REAL: filas no secas en las tablas nuevas, filas del calendario con fase/idea_ref, validaciones de los objetos nuevos,
-- esperas de aprobacion_concepto o la palanca `nuevo_orden` con clientes. Lo seco se borra (es ensayo).
-- 🔴 CUANDO LA GUARDA SALTA, ESTE ARCHIVO DEJA SU TRANSACCIÓN ABIERTA: en una SESIÓN INTERACTIVA hace falta un ROLLBACK a mano.
BEGIN;

DO $t1r$
DECLARE n bigint := 0; m bigint := 0;
BEGIN
  IF to_regclass('public.cadena_brief_creativo') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cadena_brief_creativo WHERE NOT seco' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'cadena_brief_creativo: hay % brief(s) creativo(s) reales; no se revierte. Si usas una sesión interactiva, ROLLBACK.', n; END IF;
  END IF;
  IF to_regclass('public.cadena_conceptos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cadena_conceptos WHERE NOT seco' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'cadena_conceptos: hay % concepto(s) reales; no se revierte.', n; END IF;
  END IF;
  SELECT count(*) INTO n FROM public.cadena_calendario_filas WHERE NOT seco AND (fase IS NOT NULL OR idea_ref IS NOT NULL);
  IF n > 0 THEN RAISE EXCEPTION 'cadena_calendario_filas: % fila(s) reales con fase o idea_ref; no se quitan las columnas.', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_validaciones WHERE objeto IN ('brief_creativo','concepto') AND NOT seco;
  IF n > 0 THEN RAISE EXCEPTION 'cadena_validaciones: % validación(es) reales de brief_creativo/concepto; no se restringe el CHECK.', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_esperas WHERE objeto_tipo = 'aprobacion_concepto';
  IF n > 0 THEN RAISE EXCEPTION 'cadena_esperas: % espera(s) de aprobacion_concepto; no se borra el plazo.', n; END IF;
  SELECT jsonb_array_length(COALESCE(valor->'clientes', '[]'::jsonb)) INTO m FROM public.cadena_config WHERE clave = 'nuevo_orden';
  IF COALESCE(m, 0) > 0 THEN RAISE EXCEPTION 'cadena_config.nuevo_orden tiene % cliente(s) encendido(s); apágala antes de revertir.', m; END IF;
END
$t1r$;

-- lo seco se borra (ensayos); las validaciones secas de los objetos nuevos también, para poder restringir el CHECK
DELETE FROM public.cadena_validaciones WHERE objeto IN ('brief_creativo','concepto');
ALTER TABLE public.cadena_validaciones DROP CONSTRAINT IF EXISTS cadena_validaciones_objeto_valido;
ALTER TABLE public.cadena_validaciones ADD CONSTRAINT cadena_validaciones_objeto_valido CHECK (objeto IN ('estrategia','calendario','brief'));

DROP TABLE IF EXISTS public.cadena_conceptos;
DROP TABLE IF EXISTS public.cadena_brief_creativo;

ALTER TABLE public.cadena_calendario_filas DROP COLUMN IF EXISTS idea_ref;
ALTER TABLE public.cadena_calendario_filas DROP COLUMN IF EXISTS fase;

DELETE FROM public.cadena_plazos WHERE tipo = 'aprobacion_concepto';
DELETE FROM public.cadena_config WHERE clave IN ('planeacion','max_fases','nuevo_orden');

COMMIT;

NOTIFY pgrst, 'reload schema';
