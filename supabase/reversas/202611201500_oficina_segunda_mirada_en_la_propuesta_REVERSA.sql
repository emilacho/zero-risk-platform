-- REVERSA de 202611201500 · saca el paso `segunda_mirada` de post_mesa, carrusel_mesa, kit_mesa y video_mesa: quedan como estaban (los demás pasos, en su orden)
-- La misma guarda que la ida: el motor ubica por POSICIÓN, así que sacar un paso también corre todo lo que sigue. Se niega con CUALQUIER encargo vivo
-- de esas familias (también el que espera al dueño), dentro del mismo UPDATE y con la tabla de encargos bloqueada; y si la fila no trae el paso de la migración.
-- Vuelve la reserva por pieza de las 3 mesas de imagen a la que dejó 202611201400 (3,35/4,00/4,00) y el tope a 43/45/45 (columna y límite), y lo comprueba al final.
-- Si hay que deshacer también #1250, esta va ANTES que la reversa de 202611201400 (orden inverso).
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa') FOR UPDATE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'] LOOP
    IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = t AND p->>'clave' = 'segunda_mirada') IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'REVERSA 202611201500: % no tiene el paso de la migración; no se toca', t;
    END IF;
  END LOOP;
  -- 🟡 CC6 17:14Z · la tanda 2 de CC1 va DESPUÉS de esta en video_mesa: si ya está puesta, sacar segunda_mirada dejaría una fila que no salió de ninguna ida.
  -- Solo en el video: en las 3 de imagen esos pasos son de 202611201400, que va por debajo de esta.
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = 'video_mesa' AND p->>'clave' IN ('corregir_imagen', 'editar_imagen', 'mirar_correccion')) THEN
    RAISE EXCEPTION 'REVERSA 202611201500: video_mesa trae la corrección de la tanda 2 (CC1); primero la reversa de la tanda 2';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 5.91) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND (g.limites->>'reserva_por_pieza_usd')::numeric = 6.56)) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201500: la reserva por pieza no es la que dejó la migración (5.91/6.56/6.56); no se toca';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND g.tope_encargo_usd = 45 AND (g.limites->>'tope_encargo_usd')::numeric = 45) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = 48 AND (g.limites->>'tope_encargo_usd')::numeric = 48)) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201500: el tope no es el que dejó la migración (45/48/48); no se toca';
  END IF;
END $$;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.oficina_tipos_de_grupo g
  SET pasos = (SELECT jsonb_agg(p ORDER BY i) FROM jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE p->>'clave' <> 'segunda_mirada'), version = g.version + 1
  WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa')
    AND NOT EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN
    RAISE EXCEPTION 'REVERSA 202611201500: hay encargos vivos de esas familias; esperar a que cierren (filas cambiadas: %)', n;
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g SET tope_encargo_usd = 43, limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 3.35, 'tope_encargo_usd', 43) WHERE g.tipo = 'post_mesa';
UPDATE public.oficina_tipos_de_grupo g SET tope_encargo_usd = 45, limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 4, 'tope_encargo_usd', 45) WHERE g.tipo = 'carrusel_mesa';
UPDATE public.oficina_tipos_de_grupo g SET tope_encargo_usd = 45, limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 4, 'tope_encargo_usd', 45) WHERE g.tipo = 'kit_mesa';

DO $$
DECLARE orden text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa') AND (p->>'clave' = 'segunda_mirada' OR p->>'funcion' = 'segunda_mirada')) THEN
    RAISE EXCEPTION 'REVERSA 202611201500: quedó algún paso segunda_mirada';
  END IF;
  SELECT string_agg(p->>'clave', ',' ORDER BY i) INTO orden FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE g.tipo = 'video_mesa';
  IF orden NOT LIKE '%,mesa,imagenes_clave,borrador_video,aprobar_propuestas,%' THEN
    RAISE EXCEPTION 'REVERSA 202611201500: video_mesa no quedó como antes (%)', orden;
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 3.35) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND (g.limites->>'reserva_por_pieza_usd')::numeric = 4)) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201500: la reserva por pieza no volvió a 3.35/4/4';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND g.tope_encargo_usd = 43 AND (g.limites->>'tope_encargo_usd')::numeric = 43) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = 45 AND (g.limites->>'tope_encargo_usd')::numeric = 45)) <> 3 THEN
    RAISE EXCEPTION 'REVERSA 202611201500: el tope no volvió a 43/45/45';
  END IF;
END $$;

COMMIT;
