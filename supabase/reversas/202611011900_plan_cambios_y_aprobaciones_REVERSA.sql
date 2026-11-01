-- REVERSA de 202611011900 · borra las dos tablas del ciclo del plan. Se NIEGA si hay una reescritura en curso (una corrida viva del flujo la está
-- escribiendo) y NO toca client_historical_outputs: las versiones del plan y sus tags se quedan como están.
BEGIN;
DO $$
DECLARE abiertos int;
BEGIN
  SELECT count(*) INTO abiertos FROM public.plan_cambios WHERE estado IN ('pendiente', 'en_reescritura');
  IF abiertos > 0 THEN RAISE EXCEPTION 'hay % pedidos de cambios pendientes o en reescritura: la reversa espera a que cierren', abiertos; END IF;
END $$;
DROP TABLE IF EXISTS public.plan_cambios;
DROP TABLE IF EXISTS public.plan_aprobaciones;
COMMIT;
NOTIFY pgrst, 'reload schema';
