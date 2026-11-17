-- 202611171400 · LA FOTO CON MESA · CC3 · «creativos en cada paso», tramo B (GO Lenovo 17-nov · firma de Emilio 07:18 · punto 1)
-- Solo DATO, y la plantilla nace APAGADA (activo=false): esto no enciende nada.
--   1) `oficina_tipos_de_grupo` post_mesa (nueva) · la foto con su mesa corta: 3 asientos (dirección visual, prompts, texto), UNA ronda, y la cola mecánica de la sala 1.
--      Hereda lo que la fila viva de post_img ya hace (material del portero, imagen sin foto, roles sin imagen), con sus valores de hoy; tope de la mesa 5 (post_img: 4); sin reserva.
--      Es el dato EXACTO de src/lib/oficina/plantillas/mesa.ts (POST_MESA); una prueba lo mantiene igual.
--   2) `oficina_directorio` · SOLO SUMA marcas (no quita nada): `post` a creative-director-mesa (dirige la foto), a content-creator y a marketing_instagram_curator
--      (aportan), y `post:redacta_prompts` a design-image-prompt-engineer. Ninguna pieza viva es de tipo `post`: nada de lo que corre hoy cambia.
--      La mesa congela el directorio al abrir; las piezas en vuelo siguen con el suyo.
-- La palanca (`cadena_config.creativos_con_mesa`) es la misma del tramo A (202611171030) y no se toca.
-- Encender = otro GO (aviso a Emilio): activo=true de post_mesa, post_mesa en `oficina_config.familias_activas` y el cliente en la palanca.
-- ORDEN: después de 202611171030. Se niega con encargos vivos. NO APLICADA: solo con el 🟢 de CC7. Reversa: supabase/reversas/202611171400_oficina_post_mesa_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171400: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_mesa') THEN
    RAISE EXCEPTION '202611171400: post_mesa ya existe; no se pisa';
  END IF;
  IF (SELECT clase FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_img') IS DISTINCT FROM 'post_img' THEN
    RAISE EXCEPTION '202611171400: post_img no es de la clase post_img; la jefatura no revisaría pieza_post';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_directorio WHERE EXISTS (SELECT 1 FROM unnest(pertinente_en) p WHERE p = 'post' OR p LIKE 'post:%')) THEN
    RAISE EXCEPTION '202611171400: el directorio ya tiene marcas de post; revisar antes de sumar';
  END IF;
END $$;

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo, clase) VALUES (
  'post_mesa', 'post_mesa',
  $pasos$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"elegir_foto","tipo":"codigo","quien":"sala","funcion":"elegir_foto","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"candidatas_foto","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["candidatas_foto"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"imagen","tipo":"codigo","quien":"sala","funcion":"imagen","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"decision.modo","igual":"generada"},"entrada":["prompts_validos"],"salida_artefacto":"imagenes","tope_usd":0.1},{"clave":"observar","tipo":"codigo","quien":"sala","funcion":"mesa_observar","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"decision.modo","igual":"generada"},"entrada":["imagenes","visual_direction"],"salida_artefacto":"observacion_imagen","tope_usd":0.1},{"clave":"elegir_version","tipo":"codigo","quien":"sala","funcion":"elegir_version","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"decision.modo","igual":"generada"},"entrada":["imagenes","observacion_imagen","visual_direction"],"salida_artefacto":"imagen_elegida","tope_usd":0},{"clave":"acabado","tipo":"codigo","quien":"sala","funcion":"acabado_imagen","condicion":{"tipo":"siempre"},"entrada":["imagen_elegida","candidatas_foto"],"salida_artefacto":"imagen_final","tope_usd":0},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos","condicion":{"tipo":"siempre"},"entrada":["pieza_post","imagen_final","observacion_imagen"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["pieza_post","imagen_final","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos","condicion":{"tipo":"si_cambio","artefacto":"pieza_post"},"entrada":["pieza_post","imagen_final"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega","condicion":{"tipo":"siempre"},"entrada":["pieza_post","imagen_final","chequeos"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":50,"tope_encargo_usd":5,"max_rondas":2,"imagenes_generadas_max":3,"reuso_dias":14,"pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"1:1","material_activo":true,"material_tope_usd":0.4,"material_plazo_min":20,"material_techo_min":30,"material_max_pedidos_por_encargo":1,"generar_cuando_no_hay_foto":true,"roles_sin_imagen":["cta","cierre"],"mesa":true,"asientos":["marketing_instagram_curator","design-image-prompt-engineer","content-creator"],"rondas_de_la_mesa":1}$lim$::jsonb,
  2, 5.00, false, 'post_img'
);

UPDATE public.oficina_directorio
   SET pertinente_en = array_append(pertinente_en, 'post'), version = version + 1, actualizado_en = now()
 WHERE agente IN ('creative-director-mesa', 'content-creator', 'marketing_instagram_curator') AND NOT ('post' = ANY(pertinente_en));
UPDATE public.oficina_directorio
   SET pertinente_en = array_append(pertinente_en, 'post:redacta_prompts'), version = version + 1, actualizado_en = now()
 WHERE agente = 'design-image-prompt-engineer' AND NOT ('post:redacta_prompts' = ANY(pertinente_en));

DO $$
DECLARE d int; m int; i int;
BEGIN
  IF (SELECT activo FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_mesa') IS DISTINCT FROM false
     OR (SELECT limites->'rondas_de_la_mesa' FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_mesa') IS DISTINCT FROM '1'::jsonb
     OR (SELECT jsonb_array_length(limites->'asientos') FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_mesa') IS DISTINCT FROM 3
     OR (SELECT limites->'material_activo' FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_mesa') IS DISTINCT FROM 'true'::jsonb
     OR (SELECT limites->'generar_cuando_no_hay_foto' FROM public.oficina_tipos_de_grupo WHERE tipo = 'post_mesa') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION '202611171400: post_mesa no quedó como mesa corta apagada';
  END IF;
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE agente = 'creative-director-mesa' AND rol = 'direccion' AND activo AND 'post' = ANY(pertinente_en);
  SELECT count(*) INTO m FROM public.oficina_directorio WHERE agente IN ('content-creator', 'marketing_instagram_curator') AND rol = 'miembro' AND activo AND 'post' = ANY(pertinente_en);
  SELECT count(*) INTO i FROM public.oficina_directorio WHERE agente = 'design-image-prompt-engineer' AND rol = 'miembro' AND activo AND 'post:redacta_prompts' = ANY(pertinente_en);
  IF d <> 1 OR m <> 2 OR i <> 1 THEN RAISE EXCEPTION '202611171400: el directorio no quedó con las 4 marcas de post (dirección %, miembros %, prompts %)', d, m, i; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
