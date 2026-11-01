-- 31-oct · T8 · LA MESA DE VIDEO sobre la hoja (plan de construcción v3 T8 · CC#1) · datos de la OFICINA (tablas `oficina_*`, dueño CC#2: migración aditiva, avisada en el papel LISTO de T8).
--   1) el directorio: quién se sienta en la mesa de video (`pertinente_en` con `video`): la dirección creativa la dirige (`video:dirige`) · `video-editor` escribe el guion y el pedido al generador e integra el gancho (`video`)
--      · `content-creator` escribe el pie y las etiquetas (`video`) · `marketing_instagram_curator` cuida la coherencia de Instagram solo si la pieza va a Instagram (`video:si_instagram`)
--      · `marketing_short_video_editing_coach` (tarjeta NUEVA): la ÚNICA voz del gancho final, con el método `short-video-scripter` pegado a su tarea (FIRMA 01-nov «hoja sin reja» punto 1; la misma voz que la FIRMA del 31-oct fijó en la cadena).
--      Ya estaban (2008): `design-visual-storyteller` (`video`, storyboard) · `tiktok-strategist` (`video:si_tiktok_o_reels`).
--      `marketing_video_optimization_specialist` (retención) SALE del video corto: su marca `video` pasa a `video_largo`, la familia propia del video largo de YouTube (FIRMA 01-nov punto 4; sala pendiente).
--      Las condiciones `si_instagram` y `si_tiktok_o_reels` las calcula la mesa al abrir, del brief de la hoja (`condiciones-de-video.ts`). El encanto de marca (whimsy, FIRMA 01-nov punto 2) es de CC#2: 202610312013 (`si_whimsy`, carrusel y kit); en video queda pendiente.
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
-- FIRMA 01-nov punto 4: la retención aporta en el video LARGO (familia propia), no en el corto
UPDATE public.oficina_directorio SET pertinente_en = array_replace(pertinente_en, 'video', 'video_largo'), actualizado_en = now()
  WHERE agente = 'marketing_video_optimization_specialist' AND 'video' = ANY(pertinente_en);
-- FIRMA 01-nov punto 1: la ÚNICA voz del gancho final del video corto (con el método short-video-scripter en su tarea; el método vive en código, `cadena/metodos.ts`)
INSERT INTO public.oficina_directorio (agente, rol, especialidad, sabe_hacer, necesita, entrega, pertinente_en, indicacion) VALUES
  ($d$marketing_short_video_editing_coach$d$, $d$miembro$d$, $d$el gancho del video corto y su puerta de retención: los primeros 3 segundos y los tramos que sostienen la mirada hasta el cierre$d$,
    ARRAY[$d$escribir UN gancho final a partir del gancho sugerido del brief (compara 2 o 3 familias y elige una)$d$, $d$la puerta de retención por tramos (gancho · confirmación · entrega · cierre) con texto en pantalla para verlo sin sonido$d$, $d$decir si el video necesita aviso de contenido sintético$d$],
    ARRAY[$d$el brief de la hoja (gancho sugerido, mensaje, protagonista)$d$, $d$el manual de marca$d$, $d$la red y la duración del pedido$d$],
    ARRAY[$d$el gancho final elegido y su puerta de retención, con el por qué$d$],
    ARRAY[$d$video$d$],
    ARRAY[$d$Eres la ÚNICA voz del gancho de este video: entregas UN gancho final, no alternativas; el gancho sugerido del brief es punto de partida, no obligación. No escribes el guion entero, no eliges la dirección visual y no tocas el pedido al generador: eso es de quien edita el video, que integra tu gancho como primer plano.$d$, $d$Ninguna promesa ni dato sin fuente en el gancho (precio, horario, «el más…», «gratis», salud, origen); las frases hechas de la red son folclore: el gancho sale del protagonista y de la idea.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo dice, en el idioma y el trato del país del cliente. Tu identidad está escrita en otro idioma: eso no cambia el idioma de tu respuesta.$d$])
ON CONFLICT (agente) DO NOTHING;
-- video-editor (2008 decía que el gancho lo propone quien mide la retención): ahora lo propone el coach
UPDATE public.oficina_directorio SET indicacion = array_replace(indicacion,
  $d$Aportas cómo se contaría esta idea en video corto: estructura, ritmo y qué mostrarías, sin escribir todavía el guion final. Un solo gancho por video: el gancho lo propone quien mide la retención; tú lo integras, nunca propones uno aparte.$d$,
  $d$Aportas cómo se contaría esta idea en video corto: estructura, ritmo y qué mostrarías, sin escribir todavía el guion final. Un solo gancho por video: el gancho lo propone el coach de video corto (marketing_short_video_editing_coach); tú lo integras como primer plano, nunca propones uno aparte.$d$), actualizado_en = now()
  WHERE agente = 'video-editor';

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
DECLARE d int; m int; p int; r int; v int;
BEGIN
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE activo AND rol = 'direccion' AND 'video:dirige' = ANY(pertinente_en);
  SELECT count(*) INTO m FROM public.oficina_directorio WHERE activo AND rol = 'miembro' AND EXISTS (SELECT 1 FROM unnest(pertinente_en) q WHERE split_part(q, ':', 1) = 'video');
  SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo = 'video_mesa' AND activo = false AND tope_encargo_usd = 10.00 AND (limites->>'tope_encargo_usd')::numeric = 10;
  SELECT count(*) INTO r FROM public.oficina_directorio WHERE agente = 'marketing_video_optimization_specialist' AND 'video_largo' = ANY(pertinente_en) AND NOT ('video' = ANY(pertinente_en));
  SELECT count(*) INTO v FROM public.oficina_directorio WHERE agente = 'video-editor' AND EXISTS (SELECT 1 FROM unnest(indicacion) i WHERE i LIKE '%lo propone el coach de video corto%');
  IF d <> 1 THEN RAISE EXCEPTION 'se esperaba 1 dirección de la mesa de video (creative-director-mesa) y hay %', d; END IF;
  IF m <> 6 THEN RAISE EXCEPTION 'se esperaban 6 miembros de la mesa de video (video-editor, content-creator, design-visual-storyteller, coach, instagram curator, tiktok) y hay %', m; END IF;
  IF p <> 1 THEN RAISE EXCEPTION 'falta la plantilla video_mesa inactiva con tope 10'; END IF;
  IF r <> 1 THEN RAISE EXCEPTION 'la retención debe estar en video_largo y fuera de video (FIRMA 01-nov)'; END IF;
  IF v <> 1 THEN RAISE EXCEPTION 'video-editor debe saber que el gancho lo propone el coach (FIRMA 01-nov)'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
