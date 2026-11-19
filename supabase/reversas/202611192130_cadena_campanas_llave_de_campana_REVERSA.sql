-- REVERSA de 202611192130_cadena_campanas_llave_de_campana.sql · vuelve a «una campaña viva por cliente» y «un plan, una campaña».
-- 🔴 Solo se puede si NO queda ninguna campaña con llave ni con nombre: la reversa no borra campañas ni nombres. Si hay alguna, se detiene y no cambia nada
--    (primero se cierra o se decide qué pasa con ella; las cerradas con llave también frenan, porque el único viejo no las distingue).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cadena_campanas WHERE llave_de_campana IS NOT NULL OR nombre_de_campana IS NOT NULL) THEN
    RAISE EXCEPTION 'REVERSA llave_de_campana: hay campañas con llave o con nombre; no se revierte nada';
  END IF;
END $$;

DROP INDEX IF EXISTS public.cadena_campanas_una_por_llave;
DROP INDEX IF EXISTS public.cadena_campanas_una_viva_por_cliente;
CREATE UNIQUE INDEX cadena_campanas_una_viva_por_cliente ON public.cadena_campanas (client_id, seco) WHERE estado NOT IN ('cerrada','reemplazada');
DROP INDEX IF EXISTS public.cadena_campanas_un_plan;
ALTER TABLE public.cadena_campanas ADD CONSTRAINT cadena_campanas_un_plan UNIQUE (client_id, plan_id);
ALTER TABLE public.cadena_campanas DROP COLUMN IF EXISTS nombre_de_campana;
ALTER TABLE public.cadena_campanas DROP COLUMN IF EXISTS llave_de_campana;

NOTIFY pgrst, 'reload schema';
COMMIT;
