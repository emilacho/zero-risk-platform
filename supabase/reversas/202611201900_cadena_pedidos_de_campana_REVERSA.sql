-- REVERSA de 202611201900_cadena_pedidos_de_campana.sql · quita la tabla de los pedidos de «Crear Campaña».
-- 🔴 Solo se puede si la tabla está VACÍA: la reversa no borra lo que contestó un dueño. Si hay algún pedido (ligado o no), se detiene y no cambia nada.
--    Bloquea la tabla ANTES de mirar (nota de CC7 #1255): un pedido que entrara entre el «está vacía» y el DROP se perdería.
BEGIN;

DO $$
DECLARE hay boolean;
BEGIN
  IF to_regclass('public.cadena_pedidos_de_campana') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.cadena_pedidos_de_campana IN ACCESS EXCLUSIVE MODE';
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.cadena_pedidos_de_campana)' INTO hay;
    IF hay THEN
      RAISE EXCEPTION 'REVERSA cadena_pedidos_de_campana: hay pedidos guardados; no se revierte nada';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.cadena_pedidos_de_campana;
DROP FUNCTION IF EXISTS public.cadena_pedidos_de_campana_candado();

NOTIFY pgrst, 'reload schema';
COMMIT;
