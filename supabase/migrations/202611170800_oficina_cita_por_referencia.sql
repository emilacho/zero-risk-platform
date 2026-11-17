-- 202611170800 · LA INDICACIÓN DEL DIRECTOR VISUAL: cita POR REFERENCIA, no literal · CC1 · GO Lenovo «creativos en cada paso» punto 5 (Emilio firmó 17-nov 07:18)
-- Solo DATO en `oficina_tipos_de_grupo` (post_img · carrusel_ig_v1 · kit_historias): en `indicaciones.marketing_instagram_curator`, la regla que pedía «la cita literal
--   del brief» pasa a pedir la referencia (fuente + campo; cita opcional y corta) y dice que lo no comprobable se usa igual, marcado. Es el texto EXACTO de
--   src/lib/oficina/plantillas/post-img.ts (una prueba lo mantiene igual). Ni pasos, ni límites, ni topes, ni otras indicaciones cambian.
-- Se niega con encargos vivos y si alguna de las 3 filas no trae la regla vieja EXACTA una vez. Reversa: reversas/202611170800_oficina_cita_por_referencia_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611170800: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo
      WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias')
        AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $vieja$Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.$vieja$) = 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '202611170800: las 3 plantillas no traen la regla vieja exacta; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{marketing_instagram_curator}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $vieja$Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.$vieja$
    THEN jsonb_set(r, '{regla}', to_jsonb($nueva$Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con su referencia: la fuente (brief, hoja, gran idea, manual o plan) y el campo de donde sale; la cita es opcional y corta. Lo que no tenga referencia comprobable se usa igual, marcado.$nueva$::text))
    ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') WITH ORDINALITY AS t(r, o)
))
WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE indicaciones::text LIKE '%cita literal del brief%')
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo
         WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias')
           AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $nueva$Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con su referencia: la fuente (brief, hoja, gran idea, manual o plan) y el campo de donde sale; la cita es opcional y corta. Lo que no tenga referencia comprobable se usa igual, marcado.$nueva$) = 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '202611170800: las 3 plantillas no quedaron con la regla nueva';
  END IF;
END $$;

COMMIT;
