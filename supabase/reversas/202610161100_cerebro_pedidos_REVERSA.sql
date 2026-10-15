-- REVERSA de 202610161100_cerebro_pedidos.sql · se niega si ya hay pedidos (no se pierde ningún rastro).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cerebro_pedidos LIMIT 1) THEN
    RAISE EXCEPTION 'cerebro_pedidos tiene filas: respaldarlas y retirarlas a propósito (no se borra nada solo)';
  END IF;
END $$;
DROP TABLE IF EXISTS public.cerebro_pedidos;
NOTIFY pgrst, 'reload schema';
