-- 202611111930 · TOPE DEL VIDEO US$ 15 · ENCARGO DE VIDEO US$ 35 · LO ESPERADO POR VIDEO US$ 12 · CC3 · GO Lenovo 18:56 Zúrich (regla premium: la SEGUNDA filmación de #1050 tiene que caber) + 19:44 (reserva 12)
-- Solo DATO (se baja después) en los cuatro sitios donde vive el tope del video, para que digan lo mismo (el video usa el MENOR):
--   · `oficina_tipos_de_grupo` video_mesa: `pasos[video].tope_usd` 5 → 15 · `limites.video.tope_por_video_usd` 5 → 15 · `limites.tope_encargo_usd` y la columna `tope_encargo_usd` 10 → 35
--     · `limites.reserva_por_pieza_usd` (nuevo) = 12: lo esperado por video para el freno de la campaña mientras la familia no tenga historia (`gasto-de-encargos.ts`)
--   · `cadena_config.brazo_de_video.tope_por_video_usd` 10 → 15 (el tope del proveedor)
--   · las DOS reglas del máximo (`oficina_tipos_tope_valido` y `oficina_encargos_tope_valido`, que dicen lo mismo desde 202611100900) de (0, 20] a (0, 50]:
--     el encargo nace con el tope de su familia, así que con 35 en la plantilla y 20 en `oficina_encargos` ningún video podría abrirse.
-- Es el dato EXACTO de src/lib/oficina/plantillas/video-mesa.ts (una prueba lo mantiene igual). Ninguna otra plantilla cambia.
-- ORDEN: DESPUÉS de 202611111730 (la guarda exige su `pasos` exacto, el de la cabeza publicada 0a7e55d). Se niega con encargos vivos. Reversa: reversas/202611111930_oficina_video_tope_15_35_REVERSA.sql
BEGIN;

DO $$
BEGIN
  -- cambian las reglas de las dos tablas y el tope de los pasos: con CUALQUIER encargo vivo (real o ensayo) no se toca
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611111930: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  -- el dato de antes, ENTERO, es el esperado: si alguien lo cambió, no se pisa
  IF (SELECT pasos FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $antes$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir_video","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"pedido","tipo":"codigo","quien":"sala","funcion":"pedido_de_video","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video"],"salida_artefacto":"pedido_video","tope_usd":0,"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"pedido_video","campo":"vuelve_a_la_mesa","igual":true}}},{"clave":"video","tipo":"codigo","quien":"sala","funcion":"video","condicion":{"tipo":"siempre"},"entrada":["pedido_video"],"salida_artefacto":"video","tope_usd":5},{"clave":"cuadros_video","tipo":"codigo","quien":"sala","funcion":"cuadros_video","condicion":{"tipo":"siempre"},"entrada":["video","guion"],"salida_artefacto":"cuadros_video","tope_usd":0},{"clave":"mirar_video","tipo":"agente","quien":"marketing_video_optimization_specialist","condicion":{"tipo":"si_artefacto","artefacto":"cuadros_video","campo":"hay_cuadros","igual":true},"entrada":["cuadros_video","guion"],"salida_artefacto":"mirada_video","tope_usd":0.5,"salida":{"esquema":"mirada_video.v1","reintento_formato":1},"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"mirada_video","campo":"vuelve_a_la_mesa","igual":true}}},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"siempre"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video","video","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"si_cambio","artefacto":"copy_video"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega_video","condicion":{"tipo":"siempre"},"entrada":["copy_video","video","chequeos","guion"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$antes$::jsonb THEN
    RAISE EXCEPTION '202611111930: los pasos de video_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT limites FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $lim_antes${"margen":50,"tope_encargo_usd":10,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":5}}$lim_antes$::jsonb THEN
    RAISE EXCEPTION '202611111930: los límites de video_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 10::numeric THEN
    RAISE EXCEPTION '202611111930: el tope del encargo de video_mesa no es el esperado; no se pisa';
  END IF;
  IF (SELECT valor FROM public.cadena_config WHERE clave = 'brazo_de_video') IS DISTINCT FROM $brazo_antes${"tope_por_video_usd":10}$brazo_antes$::jsonb THEN
    RAISE EXCEPTION '202611111930: la configuración del brazo de video no es la esperada; no se pisa';
  END IF;
END $$;

-- primero las reglas (para que quepa el 35), después el dato
ALTER TABLE public.oficina_encargos DROP CONSTRAINT IF EXISTS oficina_encargos_tope_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= 50);
ALTER TABLE public.oficina_tipos_de_grupo DROP CONSTRAINT IF EXISTS oficina_tipos_tope_valido;
ALTER TABLE public.oficina_tipos_de_grupo ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 50);

UPDATE public.oficina_tipos_de_grupo SET pasos = $pasos$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir_video","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"pedido","tipo":"codigo","quien":"sala","funcion":"pedido_de_video","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video"],"salida_artefacto":"pedido_video","tope_usd":0,"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"pedido_video","campo":"vuelve_a_la_mesa","igual":true}}},{"clave":"video","tipo":"codigo","quien":"sala","funcion":"video","condicion":{"tipo":"siempre"},"entrada":["pedido_video"],"salida_artefacto":"video","tope_usd":15},{"clave":"cuadros_video","tipo":"codigo","quien":"sala","funcion":"cuadros_video","condicion":{"tipo":"siempre"},"entrada":["video","guion"],"salida_artefacto":"cuadros_video","tope_usd":0},{"clave":"mirar_video","tipo":"agente","quien":"marketing_video_optimization_specialist","condicion":{"tipo":"si_artefacto","artefacto":"cuadros_video","campo":"hay_cuadros","igual":true},"entrada":["cuadros_video","guion"],"salida_artefacto":"mirada_video","tope_usd":0.5,"salida":{"esquema":"mirada_video.v1","reintento_formato":1},"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"mirada_video","campo":"vuelve_a_la_mesa","igual":true}}},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"siempre"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video","video","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"si_cambio","artefacto":"copy_video"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega_video","condicion":{"tipo":"siempre"},"entrada":["copy_video","video","chequeos","guion"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$pasos$::jsonb, limites = $lim${"margen":50,"tope_encargo_usd":35,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":15},"reserva_por_pieza_usd":12}$lim$::jsonb, tope_encargo_usd = 35 WHERE familia = 'video_mesa';
UPDATE public.cadena_config SET valor = $brazo${"tope_por_video_usd":15}$brazo$::jsonb, actualizado_en = now() WHERE clave = 'brazo_de_video';

DO $$
BEGIN
  IF (SELECT (p->>'tope_usd')::numeric FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) AS p WHERE t.familia = 'video_mesa' AND p->>'clave' = 'video') IS DISTINCT FROM 15::numeric
     OR (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 35::numeric
     OR (SELECT (valor->>'tope_por_video_usd')::numeric FROM public.cadena_config WHERE clave = 'brazo_de_video') IS DISTINCT FROM 15::numeric THEN
    RAISE EXCEPTION '202611111930: video_mesa no quedó con los topes esperados';
  END IF;
END $$;

COMMIT;
