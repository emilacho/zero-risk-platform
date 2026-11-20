-- REVERSA de 202611201500 · saca el paso `segunda_mirada` de post_mesa, carrusel_mesa, kit_mesa y video_mesa: quedan como estaban (los demás pasos, en su orden)
-- La misma guarda que la ida: el motor ubica por POSICIÓN, así que sacar un paso también corre todo lo que sigue. Se niega con CUALQUIER encargo vivo
-- de esas familias (también el que espera al dueño), dentro del mismo UPDATE y con la tabla de encargos bloqueada; y si la fila no trae el paso de la migración.
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
END $$;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.oficina_tipos_de_grupo g
  SET pasos = (SELECT jsonb_agg(p ORDER BY i) FROM jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE p->>'clave' <> 'segunda_mirada')
  WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa')
    AND NOT EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN
    RAISE EXCEPTION 'REVERSA 202611201500: hay encargos vivos de esas familias; esperar a que cierren (filas cambiadas: %)', n;
  END IF;
END $$;

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
END $$;

COMMIT;
