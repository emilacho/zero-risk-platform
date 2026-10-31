-- REVERSA de 202610312003 · cadena_brief_creativo.plazo_en · 31-oct (T3 · CC#1)
-- Quita la columna. Se niega si hay un brief abierto con plazo: una mesa trabajando no se queda sin red por una reversa (se cierra primero, a sabiendas).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.cadena_brief_creativo WHERE estado = 'borrador' AND plazo_en IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'reversa 202610312003: % brief(s) abiertos con plazo; ciérralos antes de revertir', n; END IF;
END $$;
ALTER TABLE public.cadena_brief_creativo DROP COLUMN IF EXISTS plazo_en;
