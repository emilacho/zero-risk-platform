-- REVERSA de 202610312000 · se niega si existe algún encargo de las mesas de brief o de concepto (no se borra el rastro de lo que ya trabajó).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE tipo_de_grupo IN ('brief_mesa', 'concepto_mesa')) THEN RAISE EXCEPTION 'hay encargos de las mesas de brief o de concepto: no se quitan sus plantillas'; END IF;
END $$;
DELETE FROM public.oficina_tipos_de_grupo WHERE tipo IN ('brief_mesa', 'concepto_mesa');
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'concepto'), actualizado_en = now() WHERE agente IN ('content-creator', 'design-visual-storyteller');
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'concepto:si_instagram'), actualizado_en = now() WHERE agente = 'marketing_instagram_curator';
UPDATE public.oficina_directorio SET pertinente_en = '{}', actualizado_en = now() WHERE agente = 'creative-director-mesa';
DELETE FROM public.oficina_directorio WHERE agente = 'campaign-brief-agent' AND rol = 'direccion';
CREATE UNIQUE INDEX IF NOT EXISTS oficina_directorio_una_direccion ON public.oficina_directorio (rol) WHERE rol = 'direccion' AND activo;
COMMIT;
NOTIFY pgrst, 'reload schema';
