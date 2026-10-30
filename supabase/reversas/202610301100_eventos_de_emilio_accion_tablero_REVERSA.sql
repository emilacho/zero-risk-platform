-- Reversa de 202610301100: se niega si ya hay filas con accion 'tablero' (la tabla es inmutable, no se pueden borrar).
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.eventos_de_emilio WHERE accion = 'tablero') THEN
    RAISE EXCEPTION 'hay filas con accion tablero: la tabla es inmutable, no se revierte';
  END IF;
END $$;
ALTER TABLE public.eventos_de_emilio DROP CONSTRAINT IF EXISTS eventos_de_emilio_accion_check;
ALTER TABLE public.eventos_de_emilio ADD CONSTRAINT eventos_de_emilio_accion_check CHECK (accion IN ('aprobar','rechazar','pedir_cambios','editar','comentar','abrir_rechazo'));
COMMIT;
