-- REVERSA de 202611171100_proveedor_incidentes.sql · se niega si la tabla ya tiene filas (un incidente guardado no se borra a ciegas).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.proveedor_incidentes') IS NOT NULL AND (SELECT count(*) FROM public.proveedor_incidentes) > 0 THEN
    RAISE EXCEPTION 'proveedor_incidentes tiene filas: no se borra nada';
  END IF;
END $$;
DROP TABLE IF EXISTS public.proveedor_incidentes;
COMMIT;
NOTIFY pgrst, 'reload schema';
