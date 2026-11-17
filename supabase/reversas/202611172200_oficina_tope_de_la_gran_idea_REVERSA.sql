-- REVERSA de 202611172200 · el tope de la gran idea vuelve de 10 a 7 (columna, límite y version). Se niega con una gran idea en curso o si la fila no trae 10.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia = 'concepto_mesa') THEN
    RAISE EXCEPTION 'REVERSA 202611172200: hay una gran idea en curso; esperar a que cierre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND g.tope_encargo_usd = 10 AND (g.limites->>'tope_encargo_usd')::numeric = 10) THEN
    RAISE EXCEPTION 'REVERSA 202611172200: el tope no es 10; no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 7,
    limites = g.limites || jsonb_build_object('tope_encargo_usd', 7),
    version = g.version - 1
WHERE g.tipo = 'concepto_mesa';

COMMIT;
