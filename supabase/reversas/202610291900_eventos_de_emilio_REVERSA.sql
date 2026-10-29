-- REVERSA de 202610291900_eventos_de_emilio.sql · se niega si ya hay filas (lo que Emilio dijo no se pierde solo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.eventos_de_emilio LIMIT 1) THEN
    RAISE EXCEPTION 'eventos_de_emilio tiene filas: respaldarlas y retirarlas a propósito (no se borra nada solo)';
  END IF;
END $$;
DROP TABLE IF EXISTS public.eventos_de_emilio;
DROP FUNCTION IF EXISTS public.eventos_de_emilio_inmutable();
NOTIFY pgrst, 'reload schema';
