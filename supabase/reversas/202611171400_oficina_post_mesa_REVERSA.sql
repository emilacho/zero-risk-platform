-- REVERSA de 202611171400 · borra post_mesa (si no tiene encargos) y quita SOLO las 4 marcas de post del directorio. La palanca no se toca.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE tipo_de_grupo = 'post_mesa') THEN
    RAISE EXCEPTION 'reversa 202611171400: post_mesa ya tiene encargos; apagarla (activo=false) en vez de borrarla';
  END IF;
END $$;
DELETE FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_mesa';
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'post'), version = version + 1, actualizado_en = now()
 WHERE agente IN ('creative-director-mesa', 'content-creator', 'marketing_instagram_curator') AND 'post' = ANY(pertinente_en);
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'post:redacta_prompts'), version = version + 1, actualizado_en = now()
 WHERE agente = 'design-image-prompt-engineer' AND 'post:redacta_prompts' = ANY(pertinente_en);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_mesa')
     OR EXISTS (SELECT 1 FROM public.oficina_directorio WHERE EXISTS (SELECT 1 FROM unnest(pertinente_en) p WHERE p = 'post' OR p LIKE 'post:%')) THEN
    RAISE EXCEPTION 'reversa 202611171400: no quedó como antes';
  END IF;
END $$;
COMMIT;
NOTIFY pgrst, 'reload schema';
