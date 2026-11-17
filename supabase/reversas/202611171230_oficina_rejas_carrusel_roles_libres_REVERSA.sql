-- REVERSA de 202611171230_oficina_rejas_carrusel_roles_libres: devuelve la regla vieja EXACTA del curador del carrusel. Se niega con encargos vivos o si no encuentra la nueva exacta.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171230-reversa: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $t$Asignas las imágenes por ROL de lámina, no por número de lámina. Los roles los nombra la estructura que pidan el manual y el brief (una palabra corta por lámina: portada, paso, producto, antes, después, cierre…); si la plantilla trae una lista de roles, solo esos.$t$) = 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171230-reversa: la plantilla del carrusel no trae la regla nueva exacta; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{marketing_instagram_curator}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $de$Asignas las imágenes por ROL de lámina, no por número de lámina. Los roles los nombra la estructura que pidan el manual y el brief (una palabra corta por lámina: portada, paso, producto, antes, después, cierre…); si la plantilla trae una lista de roles, solo esos.$de$ THEN jsonb_set(r, '{regla}', to_jsonb($a$Asignas las imágenes por ROL de lámina (hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre), no por número de lámina.$a$::text)) ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') WITH ORDINALITY AS t(r, o)
))
WHERE familia = 'carrusel_ig_v1';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE indicaciones::text LIKE '%Los roles los nombra la estructura que pidan el manual y el brief%')
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $t$Asignas las imágenes por ROL de lámina (hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre), no por número de lámina.$t$) = 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171230-reversa: la plantilla del carrusel no quedó con la regla nueva';
  END IF;
END $$;

COMMIT;
