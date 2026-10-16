-- REVERSA de 202610161700_cerebro_credenciales.sql · se niega si ya hay llaves guardadas (no se pierde ninguna: las variables CLIENTE_<SLUG>_* siguen valiendo mientras tanto).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cerebro_credenciales LIMIT 1) THEN
    RAISE EXCEPTION 'cerebro_credenciales tiene filas: respaldarlas y retirarlas a propósito (no se borra nada solo)';
  END IF;
END $$;
DROP TABLE IF EXISTS public.cerebro_credenciales;
NOTIFY pgrst, 'reload schema';
