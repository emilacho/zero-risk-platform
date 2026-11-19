-- 19-nov · VARIAS CAMPAÑAS VIVAS POR CLIENTE · lo esencial (firma de Emilio 21:16 Zúrich · GO de Lenovo a CC1 · entrega 1)
-- Un cliente tiene UN plan y UN manual, y de ahí salen varias campañas independientes. Para la prueba hace falta solo esto:
--   · columna `llave_de_campana`: la campaña que nace con su llave es independiente. Sin llave (NULL) nace del plan, como siempre;
--     todas las campañas que ya existen quedan sin llave y nada de lo suyo cambia;
--   · los dos únicos de siempre (un plan, una campaña · una viva por cliente) pasan a valer SOLO para las campañas sin llave;
--   · un único nuevo (cliente, seco, llave): la idempotencia de la apertura de una campaña nueva;
--   · columna `nombre_de_campana` (Lenovo 20:46Z): el nombre que lleva el botón «Flujo de la Campaña»; se pone al abrir; las de hoy quedan sin nombre.
-- Reversa: supabase/reversas/202611192130_cadena_campanas_llave_de_campana_REVERSA.sql
BEGIN;

ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS llave_de_campana text;
COMMENT ON COLUMN public.cadena_campanas.llave_de_campana IS
  'VARIAS CAMPAÑAS (19-nov): la llave con que nació una campaña independiente. NULL = nació del plan (una por plan y una viva por cliente, entre las sin llave).';
ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS nombre_de_campana text;
COMMENT ON COLUMN public.cadena_campanas.nombre_de_campana IS
  'VARIAS CAMPAÑAS (19-nov): el nombre de la campaña (lo muestra el botón «Flujo de la Campaña»). Se pone al abrirla; NULL = todavía sin nombre.';

-- los dos únicos de siempre, solo entre las campañas sin llave
ALTER TABLE public.cadena_campanas DROP CONSTRAINT IF EXISTS cadena_campanas_un_plan;
CREATE UNIQUE INDEX IF NOT EXISTS cadena_campanas_un_plan ON public.cadena_campanas (client_id, plan_id) WHERE llave_de_campana IS NULL;
DROP INDEX IF EXISTS public.cadena_campanas_una_viva_por_cliente;
CREATE UNIQUE INDEX IF NOT EXISTS cadena_campanas_una_viva_por_cliente ON public.cadena_campanas (client_id, seco) WHERE estado NOT IN ('cerrada','reemplazada') AND llave_de_campana IS NULL;

-- la idempotencia de la campaña nueva
CREATE UNIQUE INDEX IF NOT EXISTS cadena_campanas_una_por_llave ON public.cadena_campanas (client_id, seco, llave_de_campana) WHERE llave_de_campana IS NOT NULL;

-- guarda: los tres únicos con su condición exacta, y ninguna campaña que ya existía ganó una llave
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'cadena_campanas' AND (
       (indexname = 'cadena_campanas_un_plan' AND indexdef LIKE 'CREATE UNIQUE INDEX %(client_id, plan_id) WHERE %llave_de_campana IS NULL%')
    OR (indexname = 'cadena_campanas_una_viva_por_cliente' AND indexdef LIKE 'CREATE UNIQUE INDEX %(client_id, seco) WHERE %estado%cerrada%reemplazada%llave_de_campana IS NULL%')
    OR (indexname = 'cadena_campanas_una_por_llave' AND indexdef LIKE 'CREATE UNIQUE INDEX %(client_id, seco, llave_de_campana) WHERE %llave_de_campana IS NOT NULL%'));
  IF n <> 3 THEN RAISE EXCEPTION 'llave_de_campana: esperaba los 3 únicos con su condición, hay %', n; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cadena_campanas_un_plan' AND conrelid = 'public.cadena_campanas'::regclass) THEN
    RAISE EXCEPTION 'llave_de_campana: el único viejo (constraint) sigue en pie';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cadena_campanas WHERE llave_de_campana IS NOT NULL OR nombre_de_campana IS NOT NULL) THEN
    RAISE EXCEPTION 'llave_de_campana: una campaña que ya existía tiene llave o nombre';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
