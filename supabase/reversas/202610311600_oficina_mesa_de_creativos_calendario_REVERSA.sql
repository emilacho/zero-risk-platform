-- REVERSA de 202610311600 · se niega si existe alguna mesa o encargo del calendario (no se borra el rastro de lo que ya trabajó).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cadena_mesas_calendario) THEN RAISE EXCEPTION 'hay mesas del calendario: no se quita su tabla'; END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE tipo_de_grupo = 'calendario_mesa') THEN RAISE EXCEPTION 'hay encargos de la mesa del calendario: no se quita su plantilla'; END IF;
END $$;
DELETE FROM public.oficina_tipos_de_grupo WHERE tipo = 'calendario_mesa';
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'calendario'), actualizado_en = now() WHERE agente IN ('content-creator', 'design-visual-storyteller', 'marketing_instagram_curator');
UPDATE public.oficina_directorio SET pertinente_en = '{}', actualizado_en = now() WHERE agente = 'creative-director-mesa';
DELETE FROM public.oficina_directorio WHERE agente = 'social-media-strategist' AND rol = 'direccion';
CREATE UNIQUE INDEX IF NOT EXISTS oficina_directorio_una_direccion ON public.oficina_directorio (rol) WHERE rol = 'direccion' AND activo;
DROP TABLE IF EXISTS public.cadena_mesas_calendario;
COMMIT;
NOTIFY pgrst, 'reload schema';
