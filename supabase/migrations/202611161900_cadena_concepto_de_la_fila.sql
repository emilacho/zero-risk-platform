-- 202611161900 · EL CONCEPTO DE CADA PIEZA EN SU FILA · CC1 · Sprint 1 · Mejora 2 · GO Lenovo 16-nov (firma Emilio 20:05) · opción A con las 5 condiciones de CC6 (RESPUESTA-CC6-a-CC1-sprint-1-concepto-opcion-A)
-- Una columna nueva y OPCIONAL `concepto` en `cadena_calendario_filas`: la idea completa de ESA pieza (idea, qué se ve, mensaje, emoción, foto, llamado) que escribe la tanda `calendario_tanda.v3`.
--   · jsonb NULL, SIN valor por omisión; la única regla: si existe, es un objeto (las partes de adentro NO se exigen: lo que falta lo avisa la hoja, no lo rechaza la base).
--   · Sin permisos nuevos: la columna hereda los de la tabla (dueño y servidor, permisos por fila encendidos). No hay `grant` por columna.
--   · Las filas de hoy quedan con `concepto` NULL; ninguna otra columna cambia.
-- ORDEN: esta migración se aplica ANTES de publicar el código que la escribe (`guardarFilas` manda `concepto`; sin la columna, la base rechazaría el guardado del calendario).
-- Se puede volver a aplicar (si la columna ya existe con su regla, no hace nada). Reversa: reversas/202611161900_cadena_concepto_de_la_fila_REVERSA.sql
BEGIN;

ALTER TABLE public.cadena_calendario_filas ADD COLUMN IF NOT EXISTS concepto jsonb NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cadena_calendario_filas_concepto_es_objeto' AND conrelid = 'public.cadena_calendario_filas'::regclass) THEN
    ALTER TABLE public.cadena_calendario_filas ADD CONSTRAINT cadena_calendario_filas_concepto_es_objeto CHECK (concepto IS NULL OR jsonb_typeof(concepto) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN public.cadena_calendario_filas.concepto IS '16-nov · Sprint 1 · Mejora 2 · el concepto de ESTA pieza: {idea, que_se_ve, mensaje, emocion, foto, llamado}, todas opcionales; NULL = la fila no lo trae (la hoja lo arma de la idea del banco y lo avisa)';

-- comprobación final: la columna existe, es jsonb, admite NULL, no tiene valor por omisión, tiene su regla, y todas las filas de hoy quedaron en NULL
DO $$
DECLARE c record;
BEGIN
  SELECT data_type, is_nullable, column_default INTO c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cadena_calendario_filas' AND column_name = 'concepto';
  IF c IS NULL THEN RAISE EXCEPTION '202611161900: la columna concepto no quedó'; END IF;
  IF c.data_type <> 'jsonb' OR c.is_nullable <> 'YES' OR c.column_default IS NOT NULL THEN RAISE EXCEPTION '202611161900: la columna concepto no tiene la forma pedida (%, %, %)', c.data_type, c.is_nullable, c.column_default; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cadena_calendario_filas_concepto_es_objeto' AND conrelid = 'public.cadena_calendario_filas'::regclass) THEN RAISE EXCEPTION '202611161900: falta la regla del objeto'; END IF;
END $$;

COMMIT;
