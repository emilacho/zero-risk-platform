-- REVERSA de 202611172000 · quita la vuelta del paso `jefatura` de kit_mesa (los desacuerdos vuelven a ir directo a la bandeja). Se niega con encargos vivos.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION 'REVERSA 202611172000: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo t
SET pasos = (
  SELECT jsonb_agg(CASE WHEN p->>'clave' = 'jefatura' THEN p - 'vuelve_a' ELSE p END ORDER BY i)
  FROM jsonb_array_elements(t.pasos) WITH ORDINALITY AS x(p, i)
)
WHERE t.tipo = 'kit_mesa';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) p WHERE t.tipo = 'kit_mesa' AND p->>'clave' = 'jefatura' AND p ? 'vuelve_a') THEN
    RAISE EXCEPTION 'REVERSA 202611172000: la vuelta sigue en el paso jefatura';
  END IF;
END $$;

COMMIT;
