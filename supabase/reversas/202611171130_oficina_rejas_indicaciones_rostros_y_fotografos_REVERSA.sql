-- REVERSA de 202611171130_oficina_rejas_indicaciones_rostros_y_fotografos: devuelve las 2 reglas viejas EXACTAS en las 3 plantillas. Se niega con encargos vivos o si no encuentra las nuevas exactas.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171130-reversa: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $t$No inventes marcas, precios ni lugares, ni la cara de una persona real identificable sin su permiso registrado; los rostros generados sí. Lo que no puedas saber, decláralo como faltante.$t$) = 1) IS DISTINCT FROM 3
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'design-image-prompt-engineer') r WHERE r->>'regla' = $t$No nombres marcas de otro negocio ni personas reales identificables.$t$) = 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '202611171130-reversa: las 3 plantillas no traen las 2 reglas nuevas exactas; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{marketing_instagram_curator}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $de$No inventes marcas, precios ni lugares, ni la cara de una persona real identificable sin su permiso registrado; los rostros generados sí. Lo que no puedas saber, decláralo como faltante.$de$ THEN jsonb_set(r, '{regla}', to_jsonb($a$No inventes marcas, rostros, precios ni lugares; lo que no puedas saber, decláralo como faltante.$a$::text)) ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') WITH ORDINALITY AS t(r, o)
))
WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias');

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{design-image-prompt-engineer}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $de$No nombres marcas de otro negocio ni personas reales identificables.$de$ THEN jsonb_set(r, '{regla}', to_jsonb($a$No nombres marcas, fotógrafos ni personas reales.$a$::text)) ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'design-image-prompt-engineer') WITH ORDINALITY AS t(r, o)
))
WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE indicaciones::text LIKE '%ni la cara de una persona real identificable sin su permiso registrado; los rostros generados sí%' OR indicaciones::text LIKE '%No nombres marcas de otro negocio ni personas reales identificables%')
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $t$No inventes marcas, rostros, precios ni lugares; lo que no puedas saber, decláralo como faltante.$t$) = 1) IS DISTINCT FROM 3
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'design-image-prompt-engineer') r WHERE r->>'regla' = $t$No nombres marcas, fotógrafos ni personas reales.$t$) = 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '202611171130-reversa: las 3 plantillas no quedaron con las 2 reglas nuevas';
  END IF;
END $$;

COMMIT;
