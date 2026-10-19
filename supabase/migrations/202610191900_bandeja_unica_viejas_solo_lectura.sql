-- BANDEJA ÚNICA · las dos bandejas viejas quedan SOLO LECTURA (CC#3 · 19-oct · arreglo 3 de «arreglos de la cadena 1-5»).
--
-- La bandeja única es `hitl_queue`. `hitl_approvals` (la leía el tablero de Emilio) y `hitl_pending_approvals` (compuertas de n8n y escaladas del editor) dejan de recibir escrituras:
-- quien intente insertar, actualizar, borrar o vaciar recibe un error claro en vez de dejar una fila que nadie va a ver.
--
-- 🔴 SOLO ADITIVA y REVERSIBLE: no borra ni cambia filas ni columnas; solo agrega una función y dos disparadores. Se pueden leer como siempre.
-- ORDEN DE PUBLICACIÓN (importa): 1) el código de la plataforma que escribe en `hitl_queue`; 2) el tablero de Emilio leyendo `hitl_queue`; 3) ESTA migración. Antes del paso 3 el
-- tablero todavía actualiza `hitl_approvals` al resolver: con el disparador puesto ese camino falla.
-- Con 0 filas en ambas tablas el 19-oct no hay datos que mover.
--
-- REVERSA:
--   DROP TRIGGER IF EXISTS hitl_approvals_solo_lectura ON public.hitl_approvals;
--   DROP TRIGGER IF EXISTS hitl_pending_approvals_solo_lectura ON public.hitl_pending_approvals;
--   DROP FUNCTION IF EXISTS public.bandeja_vieja_solo_lectura();

CREATE OR REPLACE FUNCTION public.bandeja_vieja_solo_lectura() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'la tabla % es de solo lectura: la bandeja unica es hitl_queue (arreglo 3, 19-oct)', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.hitl_approvals') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS hitl_approvals_solo_lectura ON public.hitl_approvals;
    CREATE TRIGGER hitl_approvals_solo_lectura BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.hitl_approvals
      FOR EACH STATEMENT EXECUTE FUNCTION public.bandeja_vieja_solo_lectura();
  END IF;
  IF to_regclass('public.hitl_pending_approvals') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS hitl_pending_approvals_solo_lectura ON public.hitl_pending_approvals;
    CREATE TRIGGER hitl_pending_approvals_solo_lectura BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.hitl_pending_approvals
      FOR EACH STATEMENT EXECUTE FUNCTION public.bandeja_vieja_solo_lectura();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.bandeja_vieja_solo_lectura() IS 'Arreglo 3 (19-oct): las bandejas viejas hitl_approvals y hitl_pending_approvals son de solo lectura; la unica es hitl_queue.';
