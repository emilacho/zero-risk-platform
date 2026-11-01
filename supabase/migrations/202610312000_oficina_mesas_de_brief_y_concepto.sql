-- 31-oct · NUEVO ORDEN DE LA CADENA · T2 · las mesas de la oficina para el BRIEF creativo y el CONCEPTO (gran idea) de la campaña (plan de construcción v2 T2 · diseño v5 §3-§4).
--   1) las plantillas `brief_mesa` (un solo paso mesa, tope US$ 1,60, una ronda) y `concepto_mesa` (tope US$ 5,00 PROVISIONAL, dos rondas mínimas, plazo de la mesa 90 min) · se siembran ACTIVAS:
--      la palanca por cliente vive en la cadena (CC1, T3), no aquí.
--   2) el directorio vivo: una dirección POR tipo (por eso se quita el índice «una sola dirección activa»): `campaign-brief-agent` dirige el brief (`brief:dirige`); el director creativo
--      sigue dirigiendo carruseles y kits (explícito: `carrusel`, `kit`) y dirige el concepto (`concepto:dirige`); los miembros del concepto: `content-creator` y `design-visual-storyteller`
--      siempre, `marketing_instagram_curator` solo si la estrategia usa Instagram (`concepto:si_instagram`, condición que declara la cadena al abrir).
--   Datos puros de la oficina: NO crea tablas de la cadena (las pone CC1: `cadena_conceptos`, `cadena_brief_creativo`). Compatible con el código viejo (aplicar antes o después del código es seguro).
--   NO APLICADA: se aplica en la publicación única (T9). Reversa: supabase/reversas/202610312000_oficina_mesas_de_brief_y_concepto_REVERSA.sql
BEGIN;

DROP INDEX IF EXISTS public.oficina_directorio_una_direccion;

INSERT INTO public.oficina_directorio (agente, rol, especialidad, sabe_hacer, necesita, entrega, pertinente_en) VALUES
  ('campaign-brief-agent', 'direccion', 'dirección del brief creativo de la campaña: lo escribe corto y con secciones fijas (insight, UN mensaje, objetivo, tono, obligatorios y faltantes declarados) a partir del plan, el manual y lo que trajo el portero',
    ARRAY['estructurar un brief corto', 'citar el plan literalmente', 'declarar lo que falta sin rellenarlo'],
    ARRAY['plan de 90 días', 'manual de marca', 'estrategia y fases', 'material del portero'], ARRAY['brief creativo de campaña con sus citas'], ARRAY['brief:dirige'])
ON CONFLICT (agente) DO NOTHING;

UPDATE public.oficina_directorio SET pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige'], actualizado_en = now()
  WHERE agente = 'creative-director-mesa' AND NOT ('concepto:dirige' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'concepto'), actualizado_en = now()
  WHERE agente IN ('content-creator', 'design-visual-storyteller') AND NOT ('concepto' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'concepto:si_instagram'), actualizado_en = now()
  WHERE agente = 'marketing_instagram_curator' AND NOT ('concepto:si_instagram' = ANY(pertinente_en));

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'brief_mesa', 'brief_mesa',
  $pasos$[{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"mesa","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":60,"tope_encargo_usd":1.6,"max_rondas":1,"mesa":true,"plazo_mesa_min":30}$lim$::jsonb,
  1, 1.60, true
), (
  'concepto_mesa', 'concepto_mesa',
  $pasos2$[{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"mesa","tope_usd":0}]$pasos2$::jsonb,
  $ind2${}$ind2$::jsonb,
  '{}'::jsonb,
  $lim2${"margen":60,"tope_encargo_usd":5,"max_rondas":2,"rondas_minimas":2,"mesa":true,"plazo_mesa_min":90}$lim2$::jsonb,
  2, 5.00, true
) ON CONFLICT (tipo) DO NOTHING;

DO $$
DECLARE d int; p int; c int;
BEGIN
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE activo AND rol = 'direccion';
  SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo IN ('brief_mesa', 'concepto_mesa') AND activo;
  SELECT count(*) INTO c FROM public.oficina_directorio WHERE activo AND rol = 'miembro' AND ('concepto' = ANY(pertinente_en) OR 'concepto:si_instagram' = ANY(pertinente_en));
  IF d <> 2 THEN RAISE EXCEPTION 'se esperaban 2 direcciones activas (campaign-brief-agent y creative-director-mesa) y hay %', d; END IF;
  IF p <> 2 THEN RAISE EXCEPTION 'faltan las plantillas brief_mesa y concepto_mesa'; END IF;
  IF c <> 3 THEN RAISE EXCEPTION 'se esperaban 3 miembros del concepto y hay %', c; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
