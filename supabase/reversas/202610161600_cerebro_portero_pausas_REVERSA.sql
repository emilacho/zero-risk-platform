-- REVERSA de 202610161600_cerebro_portero_pausas.sql · se niega si ya hay pausas registradas (no se pierde ningún rastro).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cerebro_portero_pausas LIMIT 1) THEN
    RAISE EXCEPTION 'cerebro_portero_pausas tiene filas: respaldarlas y retirarlas a propósito (no se borra nada solo)';
  END IF;
END $$;
DROP TABLE IF EXISTS public.cerebro_portero_pausas;
NOTIFY pgrst, 'reload schema';
