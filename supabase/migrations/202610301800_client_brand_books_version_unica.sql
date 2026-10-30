-- 30-oct · ADENDA 1 · una versión del manual por cliente: dos escrituras simultáneas tomaban la misma versión y una se perdía en silencio.
-- Los escritores (edición del dueño, promover, brand-book) ya reintentan con max+1 al chocar (23505).
-- NO BORRA NADA: si hoy hay (client_id, version) repetidos, la migración se detiene y los lista; se resuelven a mano antes de aplicar.
-- REVERSA:  DROP INDEX IF EXISTS public.client_brand_books_client_version_uniq;
BEGIN;
DO $$
DECLARE repetidos text;
BEGIN
  SELECT string_agg(client_id::text || ' v' || version::text || ' ×' || n::text, '; ') INTO repetidos
  FROM (SELECT client_id, version, count(*) AS n FROM public.client_brand_books GROUP BY client_id, version HAVING count(*) > 1) d;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'client_brand_books tiene versiones repetidas, resuélvelas antes (no se borra nada aquí): %', repetidos;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS client_brand_books_client_version_uniq ON public.client_brand_books (client_id, version);
COMMIT;
NOTIFY pgrst, 'reload schema';
