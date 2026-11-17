-- REVERSA de 202611172100 · apaga las propuestas en imagen: deja kit_mesa, carrusel_mesa y post_mesa como estaban el 17-nov (sin los dos pasos, sin propuestas ni cota, tope 5)
-- Se niega con encargos vivos de esas familias (un encargo a mitad de propuestas no puede quedarse sin su paso) y si la fila no trae lo que puso la migración.
BEGIN;

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('kit_mesa', 'carrusel_mesa', 'post_mesa')) THEN
    RAISE EXCEPTION 'REVERSA 202611172100: hay encargos vivos de imagen; esperar a que cierren';
  END IF;
  FOREACH t IN ARRAY ARRAY['kit_mesa', 'carrusel_mesa', 'post_mesa'] LOOP
    IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = t AND p->>'clave' IN ('borrador_imagen', 'aprobar_propuestas')) IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'REVERSA 202611172100: % no tiene los dos pasos de la migración; no se toca', t;
    END IF;
  END LOOP;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET pasos = (SELECT jsonb_agg(p ORDER BY i) FROM jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE p->>'clave' NOT IN ('borrador_imagen', 'aprobar_propuestas')),
    limites = (g.limites - 'propuestas' - 'cota_de_la_mesa_usd') || jsonb_build_object('tope_encargo_usd', 5),
    tope_encargo_usd = 5
WHERE g.tipo IN ('kit_mesa', 'carrusel_mesa', 'post_mesa');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo IN ('kit_mesa', 'carrusel_mesa', 'post_mesa') AND p->>'clave' IN ('borrador_imagen', 'aprobar_propuestas'))
     OR EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo IN ('kit_mesa', 'carrusel_mesa', 'post_mesa') AND (g.limites ? 'propuestas' OR g.limites ? 'cota_de_la_mesa_usd' OR g.tope_encargo_usd <> 5)) THEN
    RAISE EXCEPTION 'REVERSA 202611172100: no quedó como antes';
  END IF;
END $$;

COMMIT;
