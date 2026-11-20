-- REVERSA de 202611201330 · quita limites.reserva_por_pieza_usd de las 3 mesas de imagen (post y kit vuelven a apartar el tope entero; carrusel, su historia).
-- Exige la reserva que dejó la migración y se niega con encargos vivos de esas familias. La version sube otra vez (cada cambio es una versión).
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN
    RAISE EXCEPTION 'REVERSA 202611201330: hay un encargo vivo de una mesa de imagen; esperar a que cierre';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 2.95) OR (g.tipo = 'carrusel_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 3.1) OR (g.tipo = 'kit_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 3.1)) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201330: la reserva no es la que dejó la migración (2.95/3.1/3.1); no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g SET limites = g.limites - 'reserva_por_pieza_usd', version = g.version + 1 WHERE g.tipo = 'post_mesa';
UPDATE public.oficina_tipos_de_grupo g SET limites = g.limites - 'reserva_por_pieza_usd', version = g.version + 1 WHERE g.tipo = 'carrusel_mesa';
UPDATE public.oficina_tipos_de_grupo g SET limites = g.limites - 'reserva_por_pieza_usd', version = g.version + 1 WHERE g.tipo = 'kit_mesa';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') AND NOT (g.limites ? 'reserva_por_pieza_usd')) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201330: la reserva no se quitó de las 3 mesas de imagen';
  END IF;
END $$;

COMMIT;
