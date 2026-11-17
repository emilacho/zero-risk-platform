-- REVERSA de 202611170800 · la regla del director visual vuelve a pedir «la cita literal del brief» en post_img · carrusel_ig_v1 · kit_historias. Exige la regla nueva EXACTA en las 3. Se niega con encargos vivos.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611170800 REVERSA: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo
      WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias')
        AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $nueva$Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con su referencia: la fuente (brief, hoja, gran idea, manual o plan) y el campo de donde sale; la cita es opcional y corta. Lo que no tenga referencia comprobable se usa igual, marcado.$nueva$) = 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '202611170800 REVERSA: las 3 plantillas no traen la regla nueva exacta; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{marketing_instagram_curator}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $nueva$Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con su referencia: la fuente (brief, hoja, gran idea, manual o plan) y el campo de donde sale; la cita es opcional y corta. Lo que no tenga referencia comprobable se usa igual, marcado.$nueva$
    THEN jsonb_set(r, '{regla}', to_jsonb($vieja$Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.$vieja$::text))
    ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') WITH ORDINALITY AS t(r, o)
))
WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo
      WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias')
        AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $vieja$Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.$vieja$) = 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '202611170800 REVERSA: las 3 plantillas no volvieron a la regla vieja';
  END IF;
END $$;

COMMIT;
