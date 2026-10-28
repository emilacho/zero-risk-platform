-- OFICINA · LA MESA (oficina creativa fluida) · CC#1 · 2026-10-28 · SIN APLICAR (el PR va sin fusionar; aplicar = decisión de Emilio/Lenovo tras la certificación de CC#3)
-- Firma de Emilio 28-oct: una pieza la hace un EQUIPO sobre un tablero compartido; el código orquesta turnos, gasto y participación, no dicta campos ni largos.
-- Esta migración es ADITIVA y apagada por construcción: no toca ninguna tabla ni fila existente.
--   1) `oficina_directorio`   · el directorio VIVO del equipo (agregar un especialista = insertar una fila; la pertinencia por tipo de pieza es dato). Se CONGELA al abrir cada pieza.
--   2) `oficina_mesa_aportes` · el libro de aportes de cada pieza (solo se agrega: sin UPDATE ni DELETE para nadie; se borra por cascada si se borra el encargo).
--   3) dos plantillas NUEVAS, INACTIVAS: `carrusel_mesa` y `kit_mesa` (derivadas de las de siempre con jefatura; tope por pieza US$ 5, el techo absoluto ×1,2 lo pone el código).
-- Las familias v1 (`carrusel_ig_v1`, `kit_historias`) siguen vivas y no se tocan: la mesa se enciende por familia (config) cuando Lenovo lo decida.
-- Tabla nueva sin GRANT + RLS = PostgREST no la ve (lección del 15-oct): van las dos cosas aquí. Repetible (IF NOT EXISTS / ON CONFLICT).
-- REVERSA: supabase/reversas/202610281500_oficina_la_mesa_REVERSA.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.oficina_directorio (
  agente         text         PRIMARY KEY,
  rol            text         NOT NULL,
  especialidad   text         NOT NULL,
  sabe_hacer     text[]       NOT NULL DEFAULT '{}',
  necesita       text[]       NOT NULL DEFAULT '{}',
  entrega        text[]       NOT NULL DEFAULT '{}',
  pertinente_en  text[]       NOT NULL DEFAULT '{}',
  activo         boolean      NOT NULL DEFAULT true,
  version        integer      NOT NULL DEFAULT 1,
  actualizado_en timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT oficina_directorio_rol_valido CHECK (rol IN ('direccion', 'miembro', 'portero'))
);
-- una sola dirección creativa activa a la vez
CREATE UNIQUE INDEX IF NOT EXISTS oficina_directorio_una_direccion ON public.oficina_directorio (rol) WHERE rol = 'direccion' AND activo;

CREATE TABLE IF NOT EXISTS public.oficina_mesa_aportes (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  encargo_id             uuid         NOT NULL REFERENCES public.oficina_encargos(id) ON DELETE CASCADE,
  n                      integer      NOT NULL,
  de                     text         NOT NULL,
  para                   text,
  tipo                   text         NOT NULL,
  texto                  text         NOT NULL DEFAULT '',
  refs                   text[]       NOT NULL DEFAULT '{}',
  responde_a             uuid         REFERENCES public.oficina_mesa_aportes(id),
  profundidad            integer      NOT NULL DEFAULT 0,
  costo_usd              numeric(12,6) NOT NULL DEFAULT 0,
  workflow_execution_id  text,
  creado_en              timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT oficina_mesa_aportes_tipo_valido CHECK (tipo IN ('dirige', 'pide', 'devuelve', 'aporta', 'responde', 'integra', 'material', 'nota')),
  CONSTRAINT oficina_mesa_aportes_n_valido CHECK (n >= 1),
  CONSTRAINT oficina_mesa_aportes_costo_valido CHECK (costo_usd >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS oficina_mesa_aportes_un_numero ON public.oficina_mesa_aportes (encargo_id, n);

-- permisos: solo la llave de servicio; el libro NO se actualiza ni se borra (se agrega)
ALTER TABLE public.oficina_directorio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_mesa_aportes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oficina_directorio FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_mesa_aportes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_directorio TO service_role;
GRANT SELECT, INSERT ON public.oficina_mesa_aportes TO service_role;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_directorio'::regclass AND polname = 'oficina_directorio_service') THEN
    CREATE POLICY oficina_directorio_service ON public.oficina_directorio FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_mesa_aportes'::regclass AND polname = 'oficina_mesa_aportes_service') THEN
    CREATE POLICY oficina_mesa_aportes_service ON public.oficina_mesa_aportes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- el directorio inicial. La pertinencia es DATO: `carrusel`/`kit` = su aporte es obligatorio en ese tipo de pieza; `carrusel:si_imagen_generada` = solo si alguna imagen se genera.
-- Los jueces de la jefatura (brand_strategist, editor_en_jefe, jefe_client_success) y jefe-marketing NO están: calificar y crear son cosas distintas (no-circularidad).
INSERT INTO public.oficina_directorio (agente, rol, especialidad, sabe_hacer, necesita, entrega, pertinente_en) VALUES
  ('creative-director-mesa', 'direccion', 'dirección creativa: abre la pieza con una idea rectora, convoca al equipo, integra y entrega la pieza completa',
    ARRAY['idea rectora y tono', 'estructura de la pieza', 'decidir qué se usa y qué se descarta', 'citar cada aporte usado o descartado'],
    ARRAY['manual de marca', 'brief y plan', 'aportes del equipo'], ARRAY['la pieza completa (láminas, pie, etiquetas) con sus citas'], ARRAY[]::text[]),
  ('content-creator', 'miembro', 'texto: titulares, cuerpo, llamado, pie de foto y etiquetas en la voz de la marca',
    ARRAY['titulares', 'textos cortos por lámina', 'pie de foto', 'etiquetas'], ARRAY['manual de marca', 'brief', 'datos verificados del cliente'], ARRAY['propuesta de texto por lámina'], ARRAY['carrusel', 'kit']),
  ('carousel-designer', 'miembro', 'ritmo y diseño de las láminas de un carrusel',
    ARRAY['orden y ritmo de las láminas', 'qué va en cada una', 'jerarquía visual'], ARRAY['texto propuesto', 'dirección visual'], ARRAY['propuesta de láminas'], ARRAY['carrusel']),
  ('design-visual-storyteller', 'miembro', 'narrativa de un kit de historias y estados',
    ARRAY['arco narrativo de la semana', 'beat de cada elemento'], ARRAY['brief del kit', 'calendario'], ARRAY['propuesta de estructura del kit'], ARRAY['kit']),
  ('marketing_instagram_curator', 'miembro', 'curaduría visual: qué foto propia sirve y dónde conviene generar una imagen',
    ARRAY['elegir fotos propias', 'dirección visual', 'detectar imágenes que conviene generar'], ARRAY['fotos del cliente con su etiqueta', 'brief'], ARRAY['dirección visual por lámina'], ARRAY['carrusel', 'kit']),
  ('design-image-prompt-engineer', 'miembro', 'redacción de las instrucciones para las imágenes que se generan',
    ARRAY['describir una imagen para generarla', 'evitar textos y marcas inventados'], ARRAY['dirección visual', 'identidad visual'], ARRAY['descripción de cada imagen a generar'], ARRAY['carrusel:si_imagen_generada', 'kit:si_imagen_generada']),
  ('portero', 'portero', 'trae material del cerebro del cliente (hechos, fotos) cuando alguien del equipo lo pide; no es un turno de agente',
    ARRAY['buscar hechos del cliente', 'traer fotos etiquetadas'], ARRAY[]::text[], ARRAY['hechos con su fuente'], ARRAY[]::text[])
ON CONFLICT (agente) DO NOTHING;

-- las dos plantillas de la mesa: NACEN INACTIVAS (derivadas por código de las de siempre con jefatura; una prueba las mantiene iguales a este dato)
INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'carrusel_mesa', 'carrusel_mesa',
  $pasos$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir_laminas","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"asignar_fotos","tipo":"codigo","quien":"sala","funcion":"asignar_fotos","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"candidatas_foto","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["candidatas_foto"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"imagen","tipo":"codigo","quien":"sala","funcion":"imagen_ref","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"hay_generadas","igual":true},"entrada":["prompts_validos"],"salida_artefacto":"imagenes","tope_usd":0.2},{"clave":"observar","tipo":"codigo","quien":"sala","funcion":"mesa_observar","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"hay_generadas","igual":true},"entrada":["imagenes","visual_direction"],"salida_artefacto":"observacion_imagen","tope_usd":0.1},{"clave":"elegir_version","tipo":"codigo","quien":"sala","funcion":"elegir_version_ref","condicion":{"tipo":"siempre"},"entrada":["imagenes","observacion_imagen","visual_direction"],"salida_artefacto":"imagenes_elegidas","tope_usd":0},{"clave":"armar","tipo":"codigo","quien":"sala","funcion":"armar_laminas","condicion":{"tipo":"siempre"},"entrada":["copy_carrusel","laminas","imagenes_elegidas"],"salida_artefacto":"laminas_armadas","tope_usd":0},{"clave":"render","tipo":"codigo","quien":"sala","funcion":"render_laminas","condicion":{"tipo":"siempre"},"entrada":["laminas_armadas"],"salida_artefacto":"render","tope_usd":0},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos_laminas","condicion":{"tipo":"siempre"},"entrada":["copy_carrusel","laminas","laminas_armadas","render","imagenes_elegidas","observacion_imagen"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["copy_carrusel","laminas","render","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"armar_2","tipo":"codigo","quien":"sala","funcion":"armar_laminas","condicion":{"tipo":"si_cambio","artefacto":["copy_carrusel","laminas","imagenes_elegidas"]},"entrada":["copy_carrusel","laminas","imagenes_elegidas"],"salida_artefacto":"laminas_armadas","tope_usd":0},{"clave":"render_2","tipo":"codigo","quien":"sala","funcion":"render_laminas","condicion":{"tipo":"si_cambio","artefacto":"laminas_armadas"},"entrada":["laminas_armadas"],"salida_artefacto":"render","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos_laminas","condicion":{"tipo":"si_cambio","artefacto":"render"},"entrada":["copy_carrusel","laminas","laminas_armadas","render","imagenes_elegidas","observacion_imagen"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega_laminas","condicion":{"tipo":"siempre"},"entrada":["copy_carrusel","render","chequeos","imagenes_elegidas"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":50,"tope_encargo_usd":5,"max_rondas":2,"imagenes_generadas_max":8,"versiones_por_ref":2,"reuso_dias":14,"plataforma":"instagram-feed","laminas_min":5,"laminas_max":10,"pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"4:5","mesa":true}$lim$::jsonb,
  2, 5.00, false
) ON CONFLICT (tipo) DO NOTHING;

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'kit_mesa', 'kit_mesa',
  $pasos$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir_laminas","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"asignar_fotos","tipo":"codigo","quien":"sala","funcion":"asignar_fotos","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"candidatas_foto","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["candidatas_foto"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"imagen","tipo":"codigo","quien":"sala","funcion":"imagen_ref","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"hay_generadas","igual":true},"entrada":["prompts_validos"],"salida_artefacto":"imagenes","tope_usd":0.2},{"clave":"observar","tipo":"codigo","quien":"sala","funcion":"mesa_observar","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"hay_generadas","igual":true},"entrada":["imagenes","visual_direction"],"salida_artefacto":"observacion_imagen","tope_usd":0.1},{"clave":"elegir_version","tipo":"codigo","quien":"sala","funcion":"elegir_version_ref","condicion":{"tipo":"siempre"},"entrada":["imagenes","observacion_imagen","visual_direction"],"salida_artefacto":"imagenes_elegidas","tope_usd":0},{"clave":"armar","tipo":"codigo","quien":"sala","funcion":"armar_laminas","condicion":{"tipo":"siempre"},"entrada":["copy_kit","estructura","imagenes_elegidas"],"salida_artefacto":"laminas_armadas","tope_usd":0},{"clave":"render","tipo":"codigo","quien":"sala","funcion":"render_laminas","condicion":{"tipo":"siempre"},"entrada":["laminas_armadas"],"salida_artefacto":"render","tope_usd":0},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos_laminas","condicion":{"tipo":"siempre"},"entrada":["copy_kit","estructura","laminas_armadas","render","imagenes_elegidas","observacion_imagen"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["copy_kit","estructura","render","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"armar_2","tipo":"codigo","quien":"sala","funcion":"armar_laminas","condicion":{"tipo":"si_cambio","artefacto":["copy_kit","estructura","imagenes_elegidas"]},"entrada":["copy_kit","estructura","imagenes_elegidas"],"salida_artefacto":"laminas_armadas","tope_usd":0},{"clave":"render_2","tipo":"codigo","quien":"sala","funcion":"render_laminas","condicion":{"tipo":"si_cambio","artefacto":"laminas_armadas"},"entrada":["laminas_armadas"],"salida_artefacto":"render","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos_laminas","condicion":{"tipo":"si_cambio","artefacto":"render"},"entrada":["copy_kit","estructura","laminas_armadas","render","imagenes_elegidas","observacion_imagen"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega_laminas","condicion":{"tipo":"siempre"},"entrada":["copy_kit","render","chequeos","imagenes_elegidas"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":50,"tope_encargo_usd":5,"max_rondas":2,"imagenes_generadas_max":8,"versiones_por_ref":2,"reuso_dias":14,"plataforma":"instagram-reel","headline_historia":60,"body_historia":140,"acompanamiento_max":700,"pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true}$lim$::jsonb,
  2, 5.00, false
) ON CONFLICT (tipo) DO NOTHING;

DO $$
DECLARE n int; m int; p int;
BEGIN
  SELECT count(*) INTO n FROM public.oficina_directorio WHERE activo;
  SELECT count(*) INTO m FROM public.oficina_tipos_de_grupo WHERE tipo IN ('carrusel_mesa', 'kit_mesa') AND activo = false AND tope_encargo_usd = 5.00 AND (limites->>'tope_encargo_usd')::numeric = 5;
  SELECT count(*) INTO p FROM pg_policy WHERE polrelid IN ('public.oficina_directorio'::regclass, 'public.oficina_mesa_aportes'::regclass);
  IF n < 7 THEN RAISE EXCEPTION 'se esperaban 7 tarjetas activas en el directorio y hay %', n; END IF;
  IF m <> 2 THEN RAISE EXCEPTION 'se esperaban las 2 plantillas de la mesa inactivas con tope 5 y hay %', m; END IF;
  IF p < 2 THEN RAISE EXCEPTION 'faltan las políticas de servicio de las tablas nuevas (%)', p; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
