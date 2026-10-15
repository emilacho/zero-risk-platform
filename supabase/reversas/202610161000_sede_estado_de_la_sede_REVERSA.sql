-- REVERSA de 202610161000_sede_estado_de_la_sede.sql · se niega si ya hay filas con el campo nuevo (no se pierde ningún dato).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.client_sede_datos WHERE campo = 'estado_de_la_sede') THEN
    RAISE EXCEPTION 'hay filas con campo estado_de_la_sede: retirarlas primero a propósito (no se borra nada solo)';
  END IF;
END $$;
BEGIN;
ALTER TABLE public.client_sede_datos DROP CONSTRAINT IF EXISTS client_sede_datos_campo_check;
ALTER TABLE public.client_sede_datos ADD CONSTRAINT client_sede_datos_campo_check CHECK (campo IN ('direccion','horario','canal_pedido','tipo_de_atencion'));
COMMIT;
NOTIFY pgrst, 'reload schema';
