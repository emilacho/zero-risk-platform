-- REVERSA de 202610121800_sede_datos_del_dueno.sql · se NIEGA si ya hay filas con los valores nuevos (no borra datos del dueño).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.client_sede_datos WHERE campo = 'tipo_de_atencion' OR fuente = 'dueno') THEN
    RAISE EXCEPTION 'hay datos de sede con campo tipo_de_atencion o fuente dueno: no se revierte (borrarlos es una decisión aparte)';
  END IF;
END $$;
ALTER TABLE public.client_sede_datos DROP CONSTRAINT IF EXISTS client_sede_datos_campo_check;
ALTER TABLE public.client_sede_datos ADD CONSTRAINT client_sede_datos_campo_check CHECK (campo IN ('direccion','horario','canal_pedido'));
ALTER TABLE public.client_sede_datos DROP CONSTRAINT IF EXISTS client_sede_datos_fuente_check;
ALTER TABLE public.client_sede_datos ADD CONSTRAINT client_sede_datos_fuente_check CHECK (fuente IN ('sitio','instagram','mapas'));
COMMIT;
NOTIFY pgrst, 'reload schema';
