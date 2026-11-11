-- 202611111700 · UN AGENTE MIRA EL VIDEO ANTES DE LA BANDEJA · GO Lenovo 11-nov 16:43 Zúrich (decisión de Emilio 16:41: «material premium sin ver el dinero»)
-- La plantilla video_mesa suma 2 pasos entre «video» y «chequeos»:
--   cuadros_video (código, sin modelo): un cuadro del medio de cada plano del guion (ffmpeg), guardado en la carpeta del encargo; sin cuadros → ficha que bloquea
--   mirar_video (agente con visión, video-editor, tope US$ 0,5): compara los cuadros con los planos del guion y la fila; JUZGA el agente (mirada_video.v1)
-- Solo cambia la columna pasos (el dato EXACTO de src/lib/oficina/plantillas/video-mesa.ts; una prueba lo mantiene igual). Aditivo, sin borrar filas.
-- Se niega con encargos de video vivos (las posiciones de los pasos cambian). Reversa: reversas/202611111700_oficina_un_agente_mira_el_video_REVERSA.sql
BEGIN;

DO $$
BEGIN
  -- insertar o quitar pasos corre las posiciones: un encargo de video VIVO quedaría apuntando al paso equivocado
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE familia = 'video_mesa' AND estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611111700: hay encargos de video vivos; esperar a que cierren';
  END IF;
  IF (SELECT array_agg(x.p->>'clave' ORDER BY x.o) FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) WITH ORDINALITY AS x(p, o) WHERE t.familia = 'video_mesa') IS DISTINCT FROM ARRAY['abrir','mesa','pedido','video','chequeos','jefatura','chequeos_2','entrega','cierre'] THEN
    RAISE EXCEPTION '202611111700: la plantilla video_mesa no tiene los pasos esperados';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo SET pasos = $pasos$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir_video","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"mesa","tope_usd":0},{"clave":"pedido","tipo":"codigo","quien":"sala","funcion":"pedido_de_video","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video"],"salida_artefacto":"pedido_video","tope_usd":0},{"clave":"video","tipo":"codigo","quien":"sala","funcion":"video","condicion":{"tipo":"siempre"},"entrada":["pedido_video"],"salida_artefacto":"video","tope_usd":5},{"clave":"cuadros_video","tipo":"codigo","quien":"sala","funcion":"cuadros_video","condicion":{"tipo":"siempre"},"entrada":["video","guion"],"salida_artefacto":"cuadros_video","tope_usd":0},{"clave":"mirar_video","tipo":"agente","quien":"video-editor","condicion":{"tipo":"si_artefacto","artefacto":"cuadros_video","campo":"hay_cuadros","igual":true},"entrada":["cuadros_video","guion"],"salida_artefacto":"mirada_video","tope_usd":0.5,"salida":{"esquema":"mirada_video.v1","reintento_formato":1}},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"siempre"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"jefatura","tipo":"jefatura","quien":"jefatura","condicion":{"tipo":"siempre"},"entrada":["guion","copy_video","video","chequeos"],"salida_artefacto":"respuesta_imagen","tope_usd":0},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos_video","condicion":{"tipo":"si_cambio","artefacto":"copy_video"},"entrada":["video","copy_video","pedido_video"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega_video","condicion":{"tipo":"siempre"},"entrada":["copy_video","video","chequeos","guion"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$pasos$::jsonb WHERE familia = 'video_mesa';

DO $$
BEGIN
  IF (SELECT array_agg(x.p->>'clave' ORDER BY x.o) FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) WITH ORDINALITY AS x(p, o) WHERE t.familia = 'video_mesa') IS DISTINCT FROM ARRAY['abrir','mesa','pedido','video','cuadros_video','mirar_video','chequeos','jefatura','chequeos_2','entrega','cierre'] THEN
    RAISE EXCEPTION '202611111700: la plantilla video_mesa no quedó con los pasos nuevos';
  END IF;
END $$;

COMMIT;
