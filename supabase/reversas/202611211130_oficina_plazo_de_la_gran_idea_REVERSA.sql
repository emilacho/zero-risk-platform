-- REVERSA de 202611211130 · el plazo de la mesa de la gran idea vuelve a 90 min · CC4 · 21-nov
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia = 'concepto_mesa') THEN
    RAISE EXCEPTION 'reversa 202611211130: hay una mesa de gran idea viva; esperar a que cierre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND (g.limites->>'plazo_mesa_min')::numeric = 340) THEN
    RAISE EXCEPTION 'reversa 202611211130: el plazo de concepto_mesa no es 340; no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET limites = g.limites || jsonb_build_object('plazo_mesa_min', 90), version = g.version + 1
WHERE g.tipo = 'concepto_mesa';

COMMIT;
