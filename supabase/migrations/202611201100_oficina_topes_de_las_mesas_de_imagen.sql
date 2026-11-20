-- 202611201100 · TOPES DE LAS 3 MESAS DE IMAGEN · CC4 · 20-nov · US$ 0 (un tope no es gasto)
-- Decisión (a) de Lenovo 12:09Z en 2026-11-20-PLAN-CC4-a-LENOVO-CC7-CC6-gpt-segundo-doctor, regla firmada por Emilio (topes = 2–3× lo estimado, límites al máximo).
-- Hoy ninguna cubre su peor caso (post 31,06/15 · carrusel 32,06/15 · kit 32,06/18): toda pieza nueva vuelve con 409 tope_no_cubre al abrir.
-- Suben a post 43, carrusel 45, kit 45: el peor caso + una vuelta entera de la segunda mirada de GPT (medido en seco sobre las filas vivas).
-- Solo DATO: tope_encargo_usd y limites.tope_encargo_usd (deben coincidir) + version. No toca pasos, cota ni margen.
-- Se niega con encargos vivos de esas familias y si alguna fila no tiene el tope leído.
-- Reversa: supabase/reversas/202611201100_oficina_topes_de_las_mesas_de_imagen_REVERSA.sql
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN
    RAISE EXCEPTION '202611201100: hay un encargo vivo de una mesa de imagen; esperar a que cierre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'post_mesa' AND g.tope_encargo_usd = 15 AND (g.limites->>'tope_encargo_usd')::numeric = 15) THEN
    RAISE EXCEPTION '202611201100: el tope de post_mesa no es el leído (15); no se toca';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'carrusel_mesa' AND g.tope_encargo_usd = 15 AND (g.limites->>'tope_encargo_usd')::numeric = 15) THEN
    RAISE EXCEPTION '202611201100: el tope de carrusel_mesa no es el leído (15); no se toca';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'kit_mesa' AND g.tope_encargo_usd = 18 AND (g.limites->>'tope_encargo_usd')::numeric = 18) THEN
    RAISE EXCEPTION '202611201100: el tope de kit_mesa no es el leído (18); no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 43, limites = g.limites || jsonb_build_object('tope_encargo_usd', 43), version = g.version + 1
WHERE g.tipo = 'post_mesa';

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 45, limites = g.limites || jsonb_build_object('tope_encargo_usd', 45), version = g.version + 1
WHERE g.tipo = 'carrusel_mesa';

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 45, limites = g.limites || jsonb_build_object('tope_encargo_usd', 45), version = g.version + 1
WHERE g.tipo = 'kit_mesa';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'post_mesa' AND g.tope_encargo_usd = 43 AND (g.limites->>'tope_encargo_usd')::numeric = 43) THEN
    RAISE EXCEPTION '202611201100: post_mesa no quedó en 43';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'carrusel_mesa' AND g.tope_encargo_usd = 45 AND (g.limites->>'tope_encargo_usd')::numeric = 45) THEN
    RAISE EXCEPTION '202611201100: carrusel_mesa no quedó en 45';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'kit_mesa' AND g.tope_encargo_usd = 45 AND (g.limites->>'tope_encargo_usd')::numeric = 45) THEN
    RAISE EXCEPTION '202611201100: kit_mesa no quedó en 45';
  END IF;
END $$;

COMMIT;
