-- REVERSA de 202611201100 · vuelve los topes de las 3 mesas de imagen a los leídos (post 15, carrusel 15, kit 18), en columna y límite.
-- Exige el tope que dejó la migración y se niega con encargos vivos de esas familias. Ojo: con estos topes ninguna cubre y las piezas nuevas vuelven con 409.
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN
    RAISE EXCEPTION 'REVERSA 202611201100: hay un encargo vivo de una mesa de imagen; esperar a que cierre';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND g.tope_encargo_usd = 43) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = 45)) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201100: los topes no son los que dejó la migración (43/45/45); no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g SET tope_encargo_usd = 15, limites = g.limites || jsonb_build_object('tope_encargo_usd', 15), version = g.version + 1 WHERE g.tipo = 'post_mesa';
UPDATE public.oficina_tipos_de_grupo g SET tope_encargo_usd = 15, limites = g.limites || jsonb_build_object('tope_encargo_usd', 15), version = g.version + 1 WHERE g.tipo = 'carrusel_mesa';
UPDATE public.oficina_tipos_de_grupo g SET tope_encargo_usd = 18, limites = g.limites || jsonb_build_object('tope_encargo_usd', 18), version = g.version + 1 WHERE g.tipo = 'kit_mesa';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo IN ('post_mesa', 'carrusel_mesa') AND g.tope_encargo_usd = 15 AND (g.limites->>'tope_encargo_usd')::numeric = 15) OR (g.tipo = 'kit_mesa' AND g.tope_encargo_usd = 18 AND (g.limites->>'tope_encargo_usd')::numeric = 18)) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201100: los topes no quedaron en 15/15/18';
  END IF;
END $$;

COMMIT;
