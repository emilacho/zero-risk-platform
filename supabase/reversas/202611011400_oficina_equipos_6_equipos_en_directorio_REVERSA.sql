-- REVERSA de 202611011400 · quita la columna `equipo` del directorio y la tabla `oficina_equipos`. Se niega si algún encargo de la oficina sigue abierto (el directorio de una pieza abierta está congelado).
--   Las 14 tarjetas vuelven a como estaban (rol, pertinente_en, indicacion no se tocaron); solo cambia `actualizado_en` de las 13 que recibieron equipo.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN RAISE EXCEPTION 'hay encargos de la oficina en curso: no se toca el directorio'; END IF;
END $$;
ALTER TABLE public.oficina_directorio DROP COLUMN IF EXISTS equipo;
DROP TABLE IF EXISTS public.oficina_equipos;
COMMIT;
NOTIFY pgrst, 'reload schema';
