-- REVERSA de 202611161900 · quita la columna `concepto` de `cadena_calendario_filas` (y su regla).
-- ⚠ BORRA LOS CONCEPTOS GUARDADOS: si ya hay filas con concepto real, respaldarlas ANTES
--    (p. ej. `select campana_id, calendario_version, id, concepto from public.cadena_calendario_filas where concepto is not null`).
-- ORDEN: primero se vuelve a publicar el código anterior (el que no manda `concepto` en el guardado); después esta reversa. Al revés, el calendario no se podría guardar.
-- Se puede volver a aplicar (si la columna ya no está, no hace nada).
BEGIN;

ALTER TABLE public.cadena_calendario_filas DROP CONSTRAINT IF EXISTS cadena_calendario_filas_concepto_es_objeto;
ALTER TABLE public.cadena_calendario_filas DROP COLUMN IF EXISTS concepto;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cadena_calendario_filas' AND column_name = 'concepto') THEN
    RAISE EXCEPTION '202611161900 REVERSA: la columna concepto sigue ahí';
  END IF;
END $$;

COMMIT;
