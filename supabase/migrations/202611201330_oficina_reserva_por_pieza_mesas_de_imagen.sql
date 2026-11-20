-- 202611201330 · RESERVA POR PIEZA DE LAS 3 MESAS DE IMAGEN · CC2 · 20-nov · US$ 0
-- GO de Lenovo 12:44Z + 12:57Z (suma carrusel_mesa) en 2026-11-20-GO-LENOVO-a-CC2-reserva-por-pieza-mesas-de-imagen (efecto visto por CC6 en la certificación de #1249).
-- Sin historia ni limites.reserva_por_pieza_usd, el freno de la campaña aparta el tope ENTERO de la mesa por pieza (43/45 con #1249).
-- carrusel_mesa tiene historia (1,58), pero de piezas de antes de la mesa con propuestas: con #1248 todo carrusel apartaría 2,50, menos de lo que cuesta.
-- Pone lo ESPERADO de una pieza, medido en seco con la misma cuenta que reserva carrusel_mesa: post 2,95 · carrusel 3,10 · kit 3,10 (no el peor caso). Con historia, manda el mayor (es un piso).
-- Solo DATO: limites.reserva_por_pieza_usd + version. No toca topes, pasos, cota ni margen.
-- Se niega con encargos vivos de esas familias y si alguna fila ya trae una reserva.
-- Reversa: supabase/reversas/202611201330_oficina_reserva_por_pieza_mesas_de_imagen_REVERSA.sql
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN
    RAISE EXCEPTION '202611201330: hay un encargo vivo de una mesa de imagen; esperar a que cierre';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') AND NOT (g.limites ? 'reserva_por_pieza_usd')) <> 3 THEN
    RAISE EXCEPTION '202611201330: las 3 mesas de imagen no son las leídas (sin reserva por pieza); no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 2.95), version = g.version + 1
WHERE g.tipo = 'post_mesa';

UPDATE public.oficina_tipos_de_grupo g
SET limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 3.1), version = g.version + 1
WHERE g.tipo = 'carrusel_mesa';

UPDATE public.oficina_tipos_de_grupo g
SET limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 3.1), version = g.version + 1
WHERE g.tipo = 'kit_mesa';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 2.95) OR (g.tipo = 'carrusel_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 3.1) OR (g.tipo = 'kit_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 3.1)) <> 3 THEN
    RAISE EXCEPTION '202611201330: la reserva no quedó en 2.95/3.1/3.1';
  END IF;
END $$;

COMMIT;
