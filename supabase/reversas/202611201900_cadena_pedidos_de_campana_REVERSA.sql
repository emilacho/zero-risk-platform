-- REVERSA de 202611201900_cadena_pedidos_de_campana.sql · quita la tabla de los pedidos de «Crear Campaña».
-- 🔴 Solo se puede si la tabla está VACÍA: la reversa no borra lo que contestó un dueño. Si hay algún pedido (ligado o no), se detiene y no cambia nada.
BEGIN;

DO $$
DECLARE hay boolean;
BEGIN
  IF to_regclass('public.cadena_pedidos_de_campana') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.cadena_pedidos_de_campana)' INTO hay;
    IF hay THEN
      RAISE EXCEPTION 'REVERSA cadena_pedidos_de_campana: hay pedidos guardados; no se revierte nada';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.cadena_pedidos_de_campana;
DROP FUNCTION IF EXISTS public.cadena_pedidos_de_campana_no_se_edita();

NOTIFY pgrst, 'reload schema';
COMMIT;
