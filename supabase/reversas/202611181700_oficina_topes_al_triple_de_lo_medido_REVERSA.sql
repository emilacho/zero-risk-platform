-- REVERSA de 202611181700 · vuelve brief_mesa a 1,6, concepto_mesa a 10 y la cota de las 3 mesas de imagen a 3,2 · CC3 · 18-nov
-- Se niega con encargos vivos de esas familias y si alguna fila no está en el valor que dejó la migración.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('brief_mesa', 'concepto_mesa', 'carrusel_mesa', 'kit_mesa', 'post_mesa')) THEN
    RAISE EXCEPTION 'reversa 202611181700: hay un encargo vivo; esperar a que cierre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'brief_mesa' AND g.tope_encargo_usd = 3.24)
     OR NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND g.tope_encargo_usd = 17.79)
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE g.tipo IN ('carrusel_mesa', 'kit_mesa', 'post_mesa') AND (g.limites->>'cota_de_la_mesa_usd')::numeric = 9.54) <> 3 THEN
    RAISE EXCEPTION 'reversa 202611181700: las filas no están en lo que dejó la migración; no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g SET tope_encargo_usd = 1.6, limites = g.limites || jsonb_build_object('tope_encargo_usd', 1.6), version = g.version + 1 WHERE g.tipo = 'brief_mesa';
UPDATE public.oficina_tipos_de_grupo g SET tope_encargo_usd = 10, limites = g.limites || jsonb_build_object('tope_encargo_usd', 10), version = g.version + 1 WHERE g.tipo = 'concepto_mesa';
UPDATE public.oficina_tipos_de_grupo g SET limites = g.limites || jsonb_build_object('cota_de_la_mesa_usd', 3.2), version = g.version + 1 WHERE g.tipo IN ('carrusel_mesa', 'kit_mesa', 'post_mesa');

COMMIT;
