-- 202611181700 · TOPES DE LA OFICINA AL TRIPLE DE LO MEDIDO · CC3 · 18-nov · US$ 0
-- Firma de Emilio (topes = 3 × lo medido) · GO de Lenovo 16:17Z en PARA-LENOVO-de-CC3-barrido-de-topes-de-gasto-medido-y-su-triple.
-- Medido (solo lectura, 18-nov): brief_mesa máx. 1,0787 → 3,24 · concepto_mesa máx. 5,9299 → 17,79 · pasada de la mesa con propuestas máx. 3,1768 → cota 9,54.
-- Ninguno baja. carrusel_mesa (15), kit_mesa (18) y post_mesa (15) ya están sobre 3 × su máximo (2,05): su tope no se toca, solo la cota de la pasada.
-- Solo DATO: tope_encargo_usd y limites.tope_encargo_usd (deben coincidir), limites.cota_de_la_mesa_usd, + version.
-- Se niega con encargos vivos de esas familias y si alguna fila no es la leída.
-- Reversa: supabase/reversas/202611181700_oficina_topes_al_triple_de_lo_medido_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('brief_mesa', 'concepto_mesa', 'carrusel_mesa', 'kit_mesa', 'post_mesa')) THEN
    RAISE EXCEPTION '202611181700: hay un encargo vivo de brief, gran idea o mesa de imagen; esperar a que cierre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'brief_mesa' AND g.tope_encargo_usd = 1.6 AND (g.limites->>'tope_encargo_usd')::numeric = 1.6) THEN
    RAISE EXCEPTION '202611181700: el tope de brief_mesa no es el leído (1,6); no se toca';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND g.tope_encargo_usd = 10 AND (g.limites->>'tope_encargo_usd')::numeric = 10) THEN
    RAISE EXCEPTION '202611181700: el tope de concepto_mesa no es el leído (10); no se toca';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE g.tipo IN ('carrusel_mesa', 'kit_mesa', 'post_mesa') AND (g.limites->>'cota_de_la_mesa_usd')::numeric = 3.2) <> 3 THEN
    RAISE EXCEPTION '202611181700: la cota de las 3 mesas de imagen no es la leída (3,2); no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 3.24, limites = g.limites || jsonb_build_object('tope_encargo_usd', 3.24), version = g.version + 1
WHERE g.tipo = 'brief_mesa';

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 17.79, limites = g.limites || jsonb_build_object('tope_encargo_usd', 17.79), version = g.version + 1
WHERE g.tipo = 'concepto_mesa';

UPDATE public.oficina_tipos_de_grupo g
SET limites = g.limites || jsonb_build_object('cota_de_la_mesa_usd', 9.54), version = g.version + 1
WHERE g.tipo IN ('carrusel_mesa', 'kit_mesa', 'post_mesa');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'brief_mesa' AND g.tope_encargo_usd = 3.24 AND (g.limites->>'tope_encargo_usd')::numeric = 3.24) THEN
    RAISE EXCEPTION '202611181700: brief_mesa no quedó en 3,24';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND g.tope_encargo_usd = 17.79 AND (g.limites->>'tope_encargo_usd')::numeric = 17.79) THEN
    RAISE EXCEPTION '202611181700: concepto_mesa no quedó en 17,79';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE g.tipo IN ('carrusel_mesa', 'kit_mesa', 'post_mesa') AND (g.limites->>'cota_de_la_mesa_usd')::numeric = 9.54) <> 3 THEN
    RAISE EXCEPTION '202611181700: la cota de las 3 mesas de imagen no quedó en 9,54';
  END IF;
END $$;

COMMIT;
