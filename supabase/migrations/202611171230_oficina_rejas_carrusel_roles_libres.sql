-- 202611171230 · QUITAR REJAS, tramo 4 de CC1 (filas 5 y 11 de AUDITORIA-CC1-rejas-oficina-y-video) · GO Lenovo 17-nov «quitar rejas» (Emilio 09:08: «apruebo todo»)
-- Solo DATO en `oficina_tipos_de_grupo`, familia carrusel_ig_v1, la regla EXACTA del curador que cerraba los roles en 9 (hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre):
-- ahora los roles los nombra la estructura del manual y el brief; si la plantilla trae `roles_de_lamina` (dato), solo esos. El código dejó de exigir la lista en el mismo tramo.
-- Es el texto EXACTO de src/lib/oficina/plantillas/carrusel-ig-v1.ts (una prueba lo mantiene igual). Ni pasos, ni límites, ni topes, ni otras indicaciones cambian.
-- Se niega con encargos vivos y si la fila no trae la regla vieja EXACTA. Reversa: supabase/reversas/202611171230_oficina_rejas_carrusel_roles_libres_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171230: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $t$Asignas las imágenes por ROL de lámina (hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre), no por número de lámina.$t$) = 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171230: la plantilla del carrusel no trae la regla vieja exacta; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{marketing_instagram_curator}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $de$Asignas las imágenes por ROL de lámina (hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre), no por número de lámina.$de$ THEN jsonb_set(r, '{regla}', to_jsonb($a$Asignas las imágenes por ROL de lámina, no por número de lámina. Los roles los nombra la estructura que pidan el manual y el brief (una palabra corta por lámina: portada, paso, producto, antes, después, cierre…); si la plantilla trae una lista de roles, solo esos.$a$::text)) ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') WITH ORDINALITY AS t(r, o)
))
WHERE familia = 'carrusel_ig_v1';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE indicaciones::text LIKE '%(hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre)%')
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'marketing_instagram_curator') r WHERE r->>'regla' = $t$Asignas las imágenes por ROL de lámina, no por número de lámina. Los roles los nombra la estructura que pidan el manual y el brief (una palabra corta por lámina: portada, paso, producto, antes, después, cierre…); si la plantilla trae una lista de roles, solo esos.$t$) = 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171230: la plantilla del carrusel no quedó con la regla nueva';
  END IF;
END $$;

COMMIT;
