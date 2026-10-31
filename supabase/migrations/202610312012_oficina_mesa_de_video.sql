-- 31-oct · T8 · LA MESA DE VIDEO sobre la hoja (plan de construcción v3 T8 · CC#1) · datos de la OFICINA (tablas `oficina_*`, dueño CC#2: migración aditiva, avisada en el papel LISTO de T8).
--   1) el directorio: quién se sienta en la mesa de video (`pertinente_en` con `video`): la dirección creativa la dirige (`video:dirige`) · `video-editor` escribe el guion y el pedido al generador (`video`)
--      · `content-creator` escribe el pie y las etiquetas (`video`) · `marketing_instagram_curator` cuida la coherencia de Instagram solo si la pieza va a Instagram (`video:si_instagram`).
--      Ya estaban (2008): `design-visual-storyteller` (`video`, storyboard) · `marketing_video_optimization_specialist` (`video`, retención: la ÚNICA voz del gancho) · `tiktok-strategist` (`video:si_tiktok_o_reels`).
--      Las condiciones `si_instagram` y `si_tiktok_o_reels` las calcula la mesa al abrir, del brief de la hoja (`condiciones-de-video.ts`). Fuera del equipo (E2): el coach de video.
--   2) la plantilla `video_mesa`: NACE INACTIVA (derivada por código de `plantillas/video-mesa.ts`; una prueba la mantiene igual a este dato). La enciende la config (`familias_activas`) cuando Emilio dé «dale».
--   3) `oficina_gastos`: el concepto `video` (lo que cobra el brazo entra al libro de la oficina).
--   ORDEN: DESPUÉS de 202610312008 (las tarjetas de video-editor y retención deben existir). NO APLICADA: se aplica en la publicación única (T9).
--   Reversa: supabase/reversas/202610312012_oficina_mesa_de_video_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'video:dirige'), actualizado_en = now()
  WHERE agente = 'creative-director-mesa' AND NOT ('video:dirige' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'video'), actualizado_en = now()
  WHERE agente IN ('video-editor', 'content-creator') AND NOT ('video' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'video:si_instagram'), actualizado_en = now()
  WHERE agente = 'marketing_instagram_curator' AND NOT ('video:si_instagram' = ANY(pertinente_en));

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'video_mesa', 'video_mesa',
  $pasos$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir_video","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"pedido","tipo":"codigo","quien":"sala","funcion":"pedido_de_video","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video"],"salida_artefacto":"pedido_video","tope_usd":0},{"clave":"video","tipo":"codigo","quien":"sala","funcion":"video","condicion":{"tipo":"siempre"},"entrada":["pedido_video"],"salida_artefacto":"video","tope_usd":5},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"siempre"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video","video","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"si_cambio","artefacto":"copy_video"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega_video","condicion":{"tipo":"siempre"},"entrada":["copy_video","video","chequeos","guion"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":50,"tope_encargo_usd":10,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":5}}$lim$::jsonb,
  2, 10.00, false
) ON CONFLICT (tipo) DO NOTHING;

ALTER TABLE public.oficina_gastos DROP CONSTRAINT IF EXISTS oficina_gastos_concepto_valido;
ALTER TABLE public.oficina_gastos ADD CONSTRAINT oficina_gastos_concepto_valido CHECK (concepto IN ('modelo', 'revisor_externo', 'imagen', 'portero', 'video'));

DO $$
DECLARE d int; m int; p int;
BEGIN
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE activo AND rol = 'direccion' AND 'video:dirige' = ANY(pertinente_en);
  SELECT count(*) INTO m FROM public.oficina_directorio WHERE activo AND rol = 'miembro' AND EXISTS (SELECT 1 FROM unnest(pertinente_en) q WHERE split_part(q, ':', 1) = 'video');
  SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo = 'video_mesa' AND activo = false AND tope_encargo_usd = 10.00 AND (limites->>'tope_encargo_usd')::numeric = 10;
  IF d <> 1 THEN RAISE EXCEPTION 'se esperaba 1 dirección de la mesa de video (creative-director-mesa) y hay %', d; END IF;
  IF m <> 6 THEN RAISE EXCEPTION 'se esperaban 6 miembros de la mesa de video (video-editor, content-creator, design-visual-storyteller, retención, instagram curator, tiktok) y hay %', m; END IF;
  IF p <> 1 THEN RAISE EXCEPTION 'falta la plantilla video_mesa inactiva con tope 10'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
