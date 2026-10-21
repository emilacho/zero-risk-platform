-- REVERSA de 202610211800_consultas_avisos_y_alertas_por_incidente.sql · se niega si ya hay filas en las tablas nuevas o datos en las columnas nuevas.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.cerebro_consultas) > 0 OR (SELECT count(*) FROM public.cerebro_alertas) > 0
     OR (SELECT count(*) FROM public.cerebro_pedidos WHERE avisar_a IS NOT NULL OR ref_de_quien_pide IS NOT NULL OR aviso IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'hay datos en lo que esta reversa quitaría: no se borra nada';
  END IF;
END $$;
DROP TABLE IF EXISTS public.cerebro_consultas;
DROP TABLE IF EXISTS public.cerebro_alertas;
ALTER TABLE public.cerebro_pedidos DROP COLUMN IF EXISTS avisar_a, DROP COLUMN IF EXISTS ref_de_quien_pide, DROP COLUMN IF EXISTS aviso;
COMMIT;
NOTIFY pgrst, 'reload schema';
