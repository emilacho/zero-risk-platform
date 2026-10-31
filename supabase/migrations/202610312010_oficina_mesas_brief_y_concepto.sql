-- 31-oct · OFICINA DE MARKETING · T1 (CC#1) · las dos mesas nuevas de la oficina y su directorio (diseño «nuevo orden de la cadena» v5 §3–§5 · plan v2 T1) · PROPUESTA · NO APLICADA (T9)
--   1) `brief_mesa`: la mesa de UN miembro que escribe el brief creativo de la campaña (campaign-brief-agent dirige solo · tope US$ 1,60 · 1 ronda).
--   2) `concepto_mesa`: la mesa del concepto (creative-director-mesa dirige · content-creator + design-visual-storyteller siempre · marketing_instagram_curator si hay Instagram ·
--      video-editor si hay video · 2 rondas mínimas · tope US$ 5,00 PROVISIONAL hasta medir · plazo propio 90 min, lo guarda la CADENA en `cadena_conceptos.plazo_en`).
--   3) el directorio es DATO: se agregan `campaign-brief-agent` (dirección del brief) y `video-editor` (miembro condicional) y las pertinencias `brief` / `concepto` / `concepto:si_instagram` / `concepto:si_video`.
--      Las condiciones `si_instagram` y `si_video` las resuelve la mesa (T2 · CC#2); hasta entonces el código vigente las lee como «no pertinente» (seguro).
-- Depende de 202610311600 (CC#2): ahí se quita el índice «una sola dirección activa» y la mesa pasa a elegir la dirección POR TIPO de pieza (`direccionDe(directorio, tipo)`).
-- Nada corre: la palanca `cadena_config.nuevo_orden` nace vacía (202610312000). Reversa: supabase/reversas/202610312010_oficina_mesas_brief_y_concepto_REVERSA.sql
BEGIN;

DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'oficina_directorio_una_direccion') THEN
    RAISE EXCEPTION 'aplica antes 202610311600_oficina_mesa_de_creativos_calendario.sql (CC#2): el índice «una sola dirección activa» sigue en pie y esta migración agrega otra dirección';
  END IF;
END
$pre$;

-- ───────────────────────── 1 · brief_mesa (un miembro)
INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'brief_mesa', 'brief_mesa',
  $pasos$[{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"mesa","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":60,"tope_encargo_usd":1.6,"max_rondas":1,"mesa":true,"un_miembro":true}$lim$::jsonb,
  1, 1.60, true
) ON CONFLICT (tipo) DO NOTHING;

-- ───────────────────────── 2 · concepto_mesa (2 rondas mínimas · plazo 90 min · tope provisional)
INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'concepto_mesa', 'concepto_mesa',
  $pasos$[{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"mesa","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":60,"tope_encargo_usd":5,"max_rondas":2,"rondas_minimas":2,"plazo_minutos":90,"plazo_lo_guarda":"cadena","tope_provisional":true,"mesa":true}$lim$::jsonb,
  2, 5.00, true
) ON CONFLICT (tipo) DO NOTHING;

-- ───────────────────────── 3 · el directorio
INSERT INTO public.oficina_directorio (agente, rol, especialidad, sabe_hacer, necesita, entrega, pertinente_en) VALUES
  ('campaign-brief-agent', 'direccion', 'el brief creativo de la campaña: de qué parte del plan sale, el insight, UN mensaje, el objetivo por red, el tono y los límites; lo que no sabe lo declara',
    ARRAY['leer el plan y el manual y sacar UN mensaje', 'objetivo y llamado por red', 'declarar faltantes y contradicciones plan vs manual'],
    ARRAY['plan vigente', 'manual de marca', 'estrategia (redes y fases)'], ARRAY['el brief creativo (brief_creativo.v1)'], ARRAY['brief']),
  ('video-editor', 'miembro', 'ideas de video y reels: qué se ve, qué se oye, cuánto dura y cómo engancha en los primeros segundos',
    ARRAY['ideas de reel/short/video', 'estructura de un video corto', 'gancho de los primeros segundos'],
    ARRAY['brief creativo', 'gran idea', 'fotos y videos propios'], ARRAY['ideas de video para el banco (con mensaje y gancho)'], ARRAY['concepto:si_video'])
ON CONFLICT (agente) DO NOTHING;

UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'concepto'), actualizado_en = now()
  WHERE agente IN ('creative-director-mesa', 'content-creator', 'design-visual-storyteller') AND NOT ('concepto' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'concepto:si_instagram'), actualizado_en = now()
  WHERE agente = 'marketing_instagram_curator' AND NOT ('concepto:si_instagram' = ANY(pertinente_en));

-- ───────────────────────── comprobación
DO $t1b$
DECLARE b int; c int; d int; m int;
BEGIN
  SELECT count(*) INTO b FROM public.oficina_tipos_de_grupo WHERE tipo = 'brief_mesa' AND tope_encargo_usd = 1.60 AND max_rondas = 1 AND activo;
  SELECT count(*) INTO c FROM public.oficina_tipos_de_grupo WHERE tipo = 'concepto_mesa' AND tope_encargo_usd = 5.00 AND max_rondas = 2 AND activo;
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE activo AND rol = 'direccion' AND agente IN ('campaign-brief-agent', 'creative-director-mesa') AND ('brief' = ANY(pertinente_en) OR 'concepto' = ANY(pertinente_en));
  SELECT count(*) INTO m FROM public.oficina_directorio WHERE activo AND rol = 'miembro' AND 'concepto' = ANY(pertinente_en);
  IF b <> 1 THEN RAISE EXCEPTION 'falta la plantilla brief_mesa'; END IF;
  IF c <> 1 THEN RAISE EXCEPTION 'falta la plantilla concepto_mesa'; END IF;
  IF d <> 2 THEN RAISE EXCEPTION 'se esperaban 2 direcciones (brief: campaign-brief-agent · concepto: creative-director-mesa) y hay %', d; END IF;
  IF m <> 2 THEN RAISE EXCEPTION 'se esperaban 2 miembros fijos del concepto (content-creator, design-visual-storyteller) y hay %', m; END IF;
END
$t1b$;

COMMIT;
NOTIFY pgrst, 'reload schema';
