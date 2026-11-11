-- REVERSA de 202611111930 · vuelve el video a US$ 5, el encargo de video a US$ 10, el brazo a US$ 10, quita lo esperado por video y vuelve las reglas a (0, 20].
-- `oficina_encargos_tope_valido` vuelve como NOT VALID: los encargos que ya corrieron con tope 35 quedan en la historia (no se borran ni se tocan) y los NUEVOS no pasan de 20.
-- Se niega con encargos vivos, si el dato no es el que dejó 202611111930, o si otra plantilla ya pasa de 20 (la regla de las plantillas no se podría volver).
BEGIN;

DO $$
BEGIN
  -- cambian las reglas de las dos tablas y el tope de los pasos: con CUALQUIER encargo vivo (real o ensayo) no se toca
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611111930 REVERSA: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  -- el dato de antes, ENTERO, es el esperado: si alguien lo cambió, no se pisa
  IF (SELECT pasos FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $antes$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir_video","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"pedido","tipo":"codigo","quien":"sala","funcion":"pedido_de_video","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video"],"salida_artefacto":"pedido_video","tope_usd":0,"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"pedido_video","campo":"vuelve_a_la_mesa","igual":true}}},{"clave":"video","tipo":"codigo","quien":"sala","funcion":"video","condicion":{"tipo":"siempre"},"entrada":["pedido_video"],"salida_artefacto":"video","tope_usd":15},{"clave":"cuadros_video","tipo":"codigo","quien":"sala","funcion":"cuadros_video","condicion":{"tipo":"siempre"},"entrada":["video","guion"],"salida_artefacto":"cuadros_video","tope_usd":0},{"clave":"mirar_video","tipo":"agente","quien":"marketing_video_optimization_specialist","condicion":{"tipo":"si_artefacto","artefacto":"cuadros_video","campo":"hay_cuadros","igual":true},"entrada":["cuadros_video","guion"],"salida_artefacto":"mirada_video","tope_usd":0.5,"salida":{"esquema":"mirada_video.v1","reintento_formato":1},"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"mirada_video","campo":"vuelve_a_la_mesa","igual":true}}},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"siempre"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video","video","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"si_cambio","artefacto":"copy_video"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega_video","condicion":{"tipo":"siempre"},"entrada":["copy_video","video","chequeos","guion"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$antes$::jsonb THEN
    RAISE EXCEPTION '202611111930 REVERSA: los pasos de video_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT limites FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $lim_antes${"margen":50,"tope_encargo_usd":35,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":15},"reserva_por_pieza_usd":12}$lim_antes$::jsonb THEN
    RAISE EXCEPTION '202611111930 REVERSA: los límites de video_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 35::numeric THEN
    RAISE EXCEPTION '202611111930 REVERSA: el tope del encargo de video_mesa no es el esperado; no se pisa';
  END IF;
  IF (SELECT valor FROM public.cadena_config WHERE clave = 'brazo_de_video') IS DISTINCT FROM $brazo_antes${"tope_por_video_usd":15}$brazo_antes$::jsonb THEN
    RAISE EXCEPTION '202611111930 REVERSA: la configuración del brazo de video no es la esperada; no se pisa';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE familia <> 'video_mesa' AND tope_encargo_usd > 20) THEN
    RAISE EXCEPTION '202611111930 REVERSA: otra plantilla ya pasa de 20; la regla de las plantillas no se puede volver';
  END IF;
END $$;

-- primero el dato (para que la regla de 20 se pueda volver), después las reglas
UPDATE public.oficina_tipos_de_grupo SET pasos = $pasos$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir_video","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"pedido","tipo":"codigo","quien":"sala","funcion":"pedido_de_video","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video"],"salida_artefacto":"pedido_video","tope_usd":0,"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"pedido_video","campo":"vuelve_a_la_mesa","igual":true}}},{"clave":"video","tipo":"codigo","quien":"sala","funcion":"video","condicion":{"tipo":"siempre"},"entrada":["pedido_video"],"salida_artefacto":"video","tope_usd":5},{"clave":"cuadros_video","tipo":"codigo","quien":"sala","funcion":"cuadros_video","condicion":{"tipo":"siempre"},"entrada":["video","guion"],"salida_artefacto":"cuadros_video","tope_usd":0},{"clave":"mirar_video","tipo":"agente","quien":"marketing_video_optimization_specialist","condicion":{"tipo":"si_artefacto","artefacto":"cuadros_video","campo":"hay_cuadros","igual":true},"entrada":["cuadros_video","guion"],"salida_artefacto":"mirada_video","tope_usd":0.5,"salida":{"esquema":"mirada_video.v1","reintento_formato":1},"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"mirada_video","campo":"vuelve_a_la_mesa","igual":true}}},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"siempre"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video","video","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"si_cambio","artefacto":"copy_video"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega_video","condicion":{"tipo":"siempre"},"entrada":["copy_video","video","chequeos","guion"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$pasos$::jsonb, limites = $lim${"margen":50,"tope_encargo_usd":10,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":5}}$lim$::jsonb, tope_encargo_usd = 10 WHERE familia = 'video_mesa';
UPDATE public.cadena_config SET valor = $brazo${"tope_por_video_usd":10}$brazo$::jsonb, actualizado_en = now() WHERE clave = 'brazo_de_video';

ALTER TABLE public.oficina_encargos DROP CONSTRAINT IF EXISTS oficina_encargos_tope_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= 20) NOT VALID;
ALTER TABLE public.oficina_tipos_de_grupo DROP CONSTRAINT IF EXISTS oficina_tipos_tope_valido;
ALTER TABLE public.oficina_tipos_de_grupo ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 20);

DO $$
BEGIN
  IF (SELECT (p->>'tope_usd')::numeric FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) AS p WHERE t.familia = 'video_mesa' AND p->>'clave' = 'video') IS DISTINCT FROM 5::numeric
     OR (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 10::numeric
     OR (SELECT (valor->>'tope_por_video_usd')::numeric FROM public.cadena_config WHERE clave = 'brazo_de_video') IS DISTINCT FROM 10::numeric THEN
    RAISE EXCEPTION '202611111930 REVERSA: video_mesa no quedó con los topes esperados';
  END IF;
END $$;

COMMIT;
