-- REVERSA de 202611012100 · vuelve a 4.000 y 2.000. Se niega si ya hay un texto más largo: no recorta lo que escribió el dueño.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.plan_cambios WHERE char_length(texto) > 4000) THEN RAISE EXCEPTION 'hay pedidos de más de 4000 caracteres'; END IF;
  IF EXISTS (SELECT 1 FROM public.notas_del_dueno WHERE char_length(comentario) > 2000) THEN RAISE EXCEPTION 'hay notas de más de 2000 caracteres'; END IF;
END $$;
ALTER TABLE public.plan_cambios DROP CONSTRAINT IF EXISTS plan_cambios_texto_check;
ALTER TABLE public.plan_cambios ADD CONSTRAINT plan_cambios_texto_check CHECK (char_length(texto) BETWEEN 5 AND 4000);
ALTER TABLE public.notas_del_dueno DROP CONSTRAINT IF EXISTS notas_del_dueno_comentario_check;
ALTER TABLE public.notas_del_dueno ADD CONSTRAINT notas_del_dueno_comentario_check CHECK (comentario IS NULL OR char_length(comentario) BETWEEN 1 AND 2000);
COMMIT;
NOTIFY pgrst, 'reload schema';
