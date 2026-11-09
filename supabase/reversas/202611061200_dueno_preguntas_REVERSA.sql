-- REVERSA de 202611061200_dueno_preguntas.sql · CC1 · 06-nov
-- Se NIEGA si la tabla ya tiene filas: una fila puede ser una respuesta del dueño o una pregunta abierta, y no se pierde ninguna.
BEGIN;
DO $reversa$
BEGIN
  IF to_regclass('public.dueno_preguntas') IS NOT NULL AND EXISTS (SELECT 1 FROM public.dueno_preguntas) THEN
    RAISE EXCEPTION 'dueno_preguntas tiene filas: no se revierte (respaldar y decidir primero)';
  END IF;
END
$reversa$;
DROP TABLE IF EXISTS public.dueno_preguntas;
COMMIT;
NOTIFY pgrst, 'reload schema';
