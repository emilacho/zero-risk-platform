-- 202611171130 · QUITAR REJAS, tramo 2 de CC1 (filas 6 y 7 de AUDITORIA-CC1-rejas-oficina-y-video) · GO Lenovo 17-nov «quitar rejas» (Emilio 09:08: «apruebo todo»)
-- Solo DATO en `oficina_tipos_de_grupo` (post_img · carrusel_ig_v1 · kit_historias), dos reglas EXACTAS:
--   · curador: «No inventes marcas, rostros…» prohibía los rostros GENERADOS que Emilio permitió el 16-nov → queda la ley (cara real identificable solo con permiso).
--   · ingeniero de prompts: «No nombres marcas, fotógrafos ni personas reales» → sin «fotógrafos» (el estilo no es reja); siguen marcas ajenas y personas reales.
-- Es el texto EXACTO de src/lib/oficina/plantillas/post-img.ts (una prueba lo mantiene igual). Ni pasos, ni límites, ni topes, ni otras indicaciones cambian.
-- Se niega con encargos vivos y si alguna de las 3 filas no trae cada regla vieja EXACTA una vez. Reversa: supabase/reversas/202611171130_oficina_rejas_indicaciones_rostros_y_fotografos_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171130: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $t$No inventes marcas, rostros, precios ni lugares; lo que no puedas saber, decláralo como faltante.$t$) = 1) IS DISTINCT FROM 3
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'design-image-prompt-engineer') r WHERE r->>'regla' = $t$No nombres marcas, fotógrafos ni personas reales.$t$) = 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '202611171130: las 3 plantillas no traen las 2 reglas viejas exactas; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{marketing_instagram_curator}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $de$No inventes marcas, rostros, precios ni lugares; lo que no puedas saber, decláralo como faltante.$de$ THEN jsonb_set(r, '{regla}', to_jsonb($a$No inventes marcas, precios ni lugares, ni la cara de una persona real identificable sin su permiso registrado; los rostros generados sí. Lo que no puedas saber, decláralo como faltante.$a$::text)) ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') WITH ORDINALITY AS t(r, o)
))
WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias');

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{design-image-prompt-engineer}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $de$No nombres marcas, fotógrafos ni personas reales.$de$ THEN jsonb_set(r, '{regla}', to_jsonb($a$No nombres marcas de otro negocio ni personas reales identificables.$a$::text)) ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'design-image-prompt-engineer') WITH ORDINALITY AS t(r, o)
))
WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE indicaciones::text LIKE '%No inventes marcas, rostros%' OR indicaciones::text LIKE '%fotógrafos ni personas reales%')
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $t$No inventes marcas, precios ni lugares, ni la cara de una persona real identificable sin su permiso registrado; los rostros generados sí. Lo que no puedas saber, decláralo como faltante.$t$) = 1) IS DISTINCT FROM 3
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'design-image-prompt-engineer') r WHERE r->>'regla' = $t$No nombres marcas de otro negocio ni personas reales identificables.$t$) = 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '202611171130: las 3 plantillas no quedaron con las 2 reglas nuevas';
  END IF;
END $$;

COMMIT;
