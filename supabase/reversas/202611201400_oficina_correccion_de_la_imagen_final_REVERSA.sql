-- REVERSA de 202611201400 · saca de las 3 mesas de imagen final SOLO los 3 pasos de la corrección (corregir_imagen · editar_imagen · mirar_correccion),
-- resta los 44 del margen y lo que sumó a la reserva por pieza (post 0,40 · carrusel y kit 0,90), quita limites.vueltas_de_correccion_imagen y la indicación del creativo
-- que agregó la migración. No toca nada más.
-- Exige que la fila tenga lo que dejó la migración y se niega con encargos vivos de esas familias (un encargo a mitad de la corrección perdería su paso).
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;

DO $$
DECLARE
  f record;
  esperada numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN
    RAISE EXCEPTION 'REVERSA 202611201400: hay un encargo vivo de una mesa de imagen; esperar a que cierre';
  END IF;
  FOR f IN SELECT tipo, pasos, limites FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(f.pasos) p WHERE p->>'clave' IN ('corregir_imagen', 'editar_imagen', 'mirar_correccion')) <> 3
       OR (f.limites->>'vueltas_de_correccion_imagen') IS DISTINCT FROM '3' OR (f.limites->>'margen')::numeric < 44
       OR jsonb_typeof(f.limites->'reserva_por_pieza_usd') IS DISTINCT FROM 'number' OR (f.limites->>'reserva_por_pieza_usd')::numeric < 0.9 THEN
      RAISE EXCEPTION 'REVERSA 202611201400: % no tiene lo que dejó la migración; no se toca', f.tipo;
    END IF;
    -- 20-nov · CC6 (ADENDA 4 de su CERTIFICACION de #1250, al certificar #1252): con otra migración encima (1500, el segundo doctor) esta reversa no frenaba,
    --   restaba sobre lo que hubiera y dejaba una mezcla que ninguna reversa reconoce. El orden «la de encima primero» ahora lo cuida la base: la reserva tiene que
    --   ser EXACTAMENTE la que dejó la ida (3,35 · 4,00 · 4,00) y no puede haber ningún paso `segunda_mirada`
    esperada := (CASE f.tipo WHEN 'post_mesa' THEN 3.35 ELSE 4.00 END);
    IF (f.limites->>'reserva_por_pieza_usd')::numeric IS DISTINCT FROM esperada THEN
      RAISE EXCEPTION 'REVERSA 202611201400: % tiene la reserva en %, no la que dejó la migración: hay otra migración encima; deshacer primero esa', f.tipo, f.limites->>'reserva_por_pieza_usd';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(f.pasos) p WHERE p->>'clave' = 'segunda_mirada') THEN
      RAISE EXCEPTION 'REVERSA 202611201400: % tiene el paso segunda_mirada (202611201500): deshacer primero esa', f.tipo;
    END IF;
  END LOOP;
END $$;

-- lo de antes, para comprobar al final los valores (no solo los pasos) · CC6 🟡 #1250
CREATE TEMP TABLE antes_202611201400 ON COMMIT DROP AS
  SELECT tipo, (limites->>'margen')::numeric AS margen, (limites->>'reserva_por_pieza_usd')::numeric AS reserva FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa');

UPDATE public.oficina_tipos_de_grupo g
SET pasos = (SELECT jsonb_agg(z.p ORDER BY z.o) FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o) WHERE z.p->>'clave' NOT IN ('corregir_imagen', 'editar_imagen', 'mirar_correccion')),
    limites = (g.limites - 'vueltas_de_correccion_imagen') || jsonb_build_object('margen', (g.limites->>'margen')::numeric - 44,
      'reserva_por_pieza_usd', (g.limites->>'reserva_por_pieza_usd')::numeric - CASE g.tipo WHEN 'post_mesa' THEN 0.4 WHEN 'carrusel_mesa' THEN 0.9 WHEN 'kit_mesa' THEN 0.9 END),
    indicaciones = CASE
      WHEN (SELECT count(*) FROM jsonb_array_elements(g.indicaciones->'design-image-prompt-engineer') r WHERE r->>'regla' NOT LIKE 'Cuando miras las imágenes finales que pediste, NO las calificas%') = 0
        THEN g.indicaciones - 'design-image-prompt-engineer'
      ELSE g.indicaciones || jsonb_build_object('design-image-prompt-engineer', (SELECT jsonb_agg(r) FROM jsonb_array_elements(g.indicaciones->'design-image-prompt-engineer') r WHERE r->>'regla' NOT LIKE 'Cuando miras las imágenes finales que pediste, NO las calificas%'))
    END,
    version = g.version + 1
WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') AND p->>'clave' IN ('corregir_imagen', 'editar_imagen', 'mirar_correccion')) THEN
    RAISE EXCEPTION 'REVERSA 202611201400: quedaron pasos de la corrección';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, LATERAL (SELECT (o - 1)::int AS i FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o) WHERE z.p->>'clave' = 'imagen') im
             WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') AND g.pasos->(im.i + 1)->>'clave' IS DISTINCT FROM 'observar') THEN
    RAISE EXCEPTION 'REVERSA 202611201400: «imagen» no quedó seguido de «observar»';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g JOIN antes_202611201400 a USING (tipo)
      WHERE (g.limites->>'margen')::numeric = a.margen - 44
        AND (g.limites->>'reserva_por_pieza_usd')::numeric = a.reserva - CASE g.tipo WHEN 'post_mesa' THEN 0.4 WHEN 'carrusel_mesa' THEN 0.9 WHEN 'kit_mesa' THEN 0.9 END
        AND NOT (g.limites ? 'vueltas_de_correccion_imagen')
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(g.indicaciones->'design-image-prompt-engineer', '[]'::jsonb)) r WHERE r->>'regla' LIKE 'Cuando miras las imágenes finales que pediste, NO las calificas%')) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201400: el margen, la reserva, las vueltas o la indicación no quedaron como antes de la migración';
  END IF;
END $$;

COMMIT;
