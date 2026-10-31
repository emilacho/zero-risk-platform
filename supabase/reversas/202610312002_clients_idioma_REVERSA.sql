-- REVERSA de 202610312002 · clients.idioma · 31-oct (T3 · CC#1)
-- Quita la columna. Se niega si alguna ficha ya la usa (un idioma escrito a mano no se borra por una reversa: se vacía primero, a sabiendas).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.clients WHERE idioma IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'reversa 202610312002: % ficha(s) tienen idioma; vacíalo a mano antes de revertir', n; END IF;
END $$;
ALTER TABLE public.clients DROP COLUMN IF EXISTS idioma;
