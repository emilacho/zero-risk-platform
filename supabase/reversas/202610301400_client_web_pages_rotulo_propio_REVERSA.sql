-- Reversa de 202610301400 (N3 · rótulo «propio» en el origen). Se niega si ya hay filas `referencia` (habría que devolverlas a `propio` primero, y eso es una decisión).
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.client_web_pages WHERE owner_role = 'referencia') THEN
    RAISE EXCEPTION 'hay filas client_web_pages con owner_role referencia: decide antes qué rótulo les toca';
  END IF;
END $$;
DROP TRIGGER IF EXISTS client_web_pages_rotular_propio ON public.client_web_pages;
DROP FUNCTION IF EXISTS public.client_web_pages_rotular_propio();
DROP FUNCTION IF EXISTS public.client_web_pages_es_del_cliente(uuid, text);
ALTER TABLE public.client_web_pages DROP CONSTRAINT IF EXISTS client_web_pages_owner_role_chk;
ALTER TABLE public.client_web_pages ADD CONSTRAINT client_web_pages_owner_role_chk CHECK (owner_role = ANY (ARRAY['propio'::text, 'competidor'::text]));
COMMIT;
