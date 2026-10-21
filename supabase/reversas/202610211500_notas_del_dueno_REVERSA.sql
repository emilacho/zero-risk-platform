-- REVERSA de 202610211500_notas_del_dueno.sql · se niega si ya hay filas (no se pierde ninguna nota ni rastro).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.notas_del_dueno LIMIT 1) OR EXISTS (SELECT 1 FROM public.autorevisiones_del_productor LIMIT 1) THEN
    RAISE EXCEPTION 'notas_del_dueno o autorevisiones_del_productor tienen filas: respaldarlas y retirarlas a propósito (no se borra nada solo)';
  END IF;
END $$;
DROP VIEW IF EXISTS public.notas_del_dueno_para_el_cerebro;
DROP VIEW IF EXISTS public.notas_del_dueno_registro;
DROP TABLE IF EXISTS public.autorevisiones_del_productor;
DROP TABLE IF EXISTS public.notas_del_dueno;
NOTIFY pgrst, 'reload schema';
