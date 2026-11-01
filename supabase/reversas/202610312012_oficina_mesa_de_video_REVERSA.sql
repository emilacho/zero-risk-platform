-- REVERSA de 202610312012 · quita la mesa de video: las marcas `video*` que esta migración agregó al directorio, la plantilla `video_mesa` y el concepto de gasto `video`.
-- Se niega si hay encargos de la mesa de video (en curso o cerrados con gastos `video`): el libro de la oficina no se borra y el CHECK no puede volver atrás con filas `video`.
-- NO toca lo que trajo 202610312008 (design-visual-storyteller `video`, retención `video`, tiktok-strategist `video:si_tiktok_o_reels`): eso lo deshace su propia reversa.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE familia = 'video_mesa') THEN RAISE EXCEPTION 'hay encargos de la mesa de video: no se quita la mesa'; END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_gastos WHERE concepto = 'video') THEN RAISE EXCEPTION 'hay gastos de video en el libro de la oficina: el CHECK no puede volver atrás'; END IF;
END $$;
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'video:dirige'), actualizado_en = now() WHERE agente = 'creative-director-mesa';
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'video'), actualizado_en = now() WHERE agente IN ('video-editor', 'content-creator');
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'video:si_instagram'), actualizado_en = now() WHERE agente = 'marketing_instagram_curator';
UPDATE public.oficina_directorio SET pertinente_en = array_replace(pertinente_en, 'video_largo', 'video'), actualizado_en = now() WHERE agente = 'marketing_video_optimization_specialist';
DELETE FROM public.oficina_directorio WHERE agente = 'marketing_short_video_editing_coach';
UPDATE public.oficina_directorio SET indicacion = array_replace(indicacion,
  $d$Aportas cómo se contaría esta idea en video corto: estructura, ritmo y qué mostrarías, sin escribir todavía el guion final. Un solo gancho por video: el gancho lo propone el coach de video corto (marketing_short_video_editing_coach); tú lo integras como primer plano, nunca propones uno aparte.$d$,
  $d$Aportas cómo se contaría esta idea en video corto: estructura, ritmo y qué mostrarías, sin escribir todavía el guion final. Un solo gancho por video: el gancho lo propone quien mide la retención; tú lo integras, nunca propones uno aparte.$d$), actualizado_en = now()
  WHERE agente = 'video-editor';
DELETE FROM public.oficina_tipos_de_grupo WHERE tipo = 'video_mesa';
ALTER TABLE public.oficina_gastos DROP CONSTRAINT IF EXISTS oficina_gastos_concepto_valido;
ALTER TABLE public.oficina_gastos ADD CONSTRAINT oficina_gastos_concepto_valido CHECK (concepto IN ('modelo', 'revisor_externo', 'imagen', 'portero'));
COMMIT;
NOTIFY pgrst, 'reload schema';
