-- REVERSA de 202610161500_cerebro_dueno_preguntas.sql · se niega si ya hay preguntas registradas (no se pierde ningún rastro).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cerebro_dueno_preguntas LIMIT 1) THEN
    RAISE EXCEPTION 'cerebro_dueno_preguntas tiene filas: respaldarlas y retirarlas a propósito (no se borra nada solo)';
  END IF;
END $$;
DROP TABLE IF EXISTS public.cerebro_dueno_preguntas;
NOTIFY pgrst, 'reload schema';
