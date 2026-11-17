-- 202611172200 · TOPE DE LA GRAN IDEA (concepto_mesa) 7 → 10 · CC1 · Sprint 4 · D (ADENDA 4 · pedido de Lenovo para que entre la crítica) · US$ 0
-- Peor caso medido sin el plan: 6,15 (d0794d06) + crítica 2 × 0,79 + brief largo 0,07 ≈ 7,80; + reserva de un turno 0,6 = 8,40; + margen → 10 (techo de la mesa 12).
-- Solo DATO: la columna tope_encargo_usd y limites.tope_encargo_usd (deben coincidir) + version. Se niega con encargos de concepto vivos y si la fila no es la leída (7).
-- Reversa: supabase/reversas/202611172200_oficina_tope_de_la_gran_idea_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia = 'concepto_mesa') THEN
    RAISE EXCEPTION '202611172200: hay una gran idea en curso; esperar a que cierre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND g.tope_encargo_usd = 7 AND (g.limites->>'tope_encargo_usd')::numeric = 7) THEN
    RAISE EXCEPTION '202611172200: el tope de concepto_mesa no es el leído (7); no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 10,
    limites = g.limites || jsonb_build_object('tope_encargo_usd', 10),
    version = g.version + 1
WHERE g.tipo = 'concepto_mesa';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND g.tope_encargo_usd = 10 AND (g.limites->>'tope_encargo_usd')::numeric = 10) THEN
    RAISE EXCEPTION '202611172200: el tope no quedó en 10';
  END IF;
END $$;

COMMIT;
