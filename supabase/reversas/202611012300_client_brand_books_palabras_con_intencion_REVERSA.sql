-- REVERSA de 202611012300 · se niega si alguien ya declaró una palabra: no borra lo que dijo el dueño ni una norma.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.client_brand_books WHERE palabras_con_intencion <> '[]'::jsonb) THEN RAISE EXCEPTION 'hay palabras declaradas; no se revierte'; END IF;
END $$;
ALTER TABLE public.client_brand_books DROP CONSTRAINT IF EXISTS client_brand_books_palabras_con_intencion_lista;
ALTER TABLE public.client_brand_books DROP COLUMN IF EXISTS palabras_con_intencion;
COMMIT;
NOTIFY pgrst, 'reload schema';
