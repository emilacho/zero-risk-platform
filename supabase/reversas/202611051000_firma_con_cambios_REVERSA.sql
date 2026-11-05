-- REVERSA de 202611051000_firma_con_cambios.sql. Se niega si ya hay firmas con cambios: borrarlas perdería lo que el dueño firmó.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.finanzas_tableros WHERE firma_con_cambios IS NOT NULL) THEN
    RAISE EXCEPTION 'hay firmas con cambios guardadas: no se borra la columna';
  END IF;
END $$;
DROP INDEX IF EXISTS public.finanzas_tableros_con_cambios;
ALTER TABLE public.finanzas_tableros DROP COLUMN IF EXISTS firma_con_cambios;
