-- 202611201200 · EL SEGUNDO DOCTOR CREATIVO EN LA PROPUESTA (post_mesa · carrusel_mesa · kit_mesa · video_mesa) · CC4 · PLAN v4 (🟢 CC7 11:26Z · 🟢 condicionado CC6 11:26Z · LENOVO 11:27Z) · US$ 0
-- Solo DATO: es exactamente `conSegundaMirada(fila viva)` de src/lib/oficina/segunda-mirada.ts.
--   · un paso nuevo `segunda_mirada` (código, tope 0,5, vuelve a la mesa máx. 1 por su propio contador)
--   · imagen: justo después de `borrador_imagen` (antes de `aprobar_propuestas`) · video: justo después de `imagenes_clave` (antes de `borrador_video`)
-- No toca topes, límites, indicaciones, modelos, activo ni los demás pasos.
-- GUARDA (CC6 9 · CC7 11:27Z): el motor ubica a la pieza por POSICIÓN (`ultimo`) y lee la plantilla viva; meter un paso corre un lugar todo lo que sigue.
--   Por eso se niega con CUALQUIER encargo vivo de esas 4 familias, también el que solo espera al dueño (más estricta que 202611172100),
--   y la guarda va DENTRO del mismo UPDATE, con la tabla de encargos bloqueada para escritura hasta el COMMIT: no entra un encargo entre mirar y cambiar.
-- Reversa: supabase/reversas/202611201200_oficina_segunda_mirada_en_la_propuesta_REVERSA.sql
BEGIN;

SET LOCAL lock_timeout = '5s';
-- nadie crea ni mueve un encargo mientras dura esta transacción (si alguien está escribiendo, espera 5 s y se niega)
LOCK TABLE public.oficina_encargos IN SHARE MODE;
-- las 4 filas quedan bloqueadas: nadie más las cambia entre la revisión y el cambio
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa') FOR UPDATE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = t) THEN
      RAISE EXCEPTION '202611201200: no existe la fila %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = t AND (p->>'clave' = 'segunda_mirada' OR p->>'funcion' = 'segunda_mirada')) THEN
      RAISE EXCEPTION '202611201200: % ya tiene la segunda mirada; no se pisa', t;
    END IF;
    IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = t AND p->>'clave' IN ('borrador_imagen', 'imagenes_clave')) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION '202611201200: % no tiene exactamente un borrador_imagen o un imagenes_clave; no se sabe dónde va', t;
    END IF;
  END LOOP;
  -- en el video, el imagenes_clave elegido es el de las PROPUESTAS (lo sigue borrador_video), no el final
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY AS a(p, i), jsonb_array_elements(g.pasos) WITH ORDINALITY AS b(q, k)
                 WHERE g.tipo = 'video_mesa' AND a.p->>'clave' = 'imagenes_clave' AND b.q->>'clave' = 'borrador_video' AND b.k = a.i + 1) THEN
    RAISE EXCEPTION '202611201200: en video_mesa, imagenes_clave no va seguido de borrador_video; no se toca';
  END IF;
END $$;

-- el paso nuevo, con la guarda de encargos vivos en la MISMA sentencia; si cambió menos de las 4 filas, se niega todo
DO $$
DECLARE n int;
BEGIN
  UPDATE public.oficina_tipos_de_grupo g
  SET pasos = (
    SELECT jsonb_agg(q ORDER BY i, j)
    FROM jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i),
    LATERAL (
      SELECT p AS q, 0 AS j
      UNION ALL
      SELECT $s${"clave":"segunda_mirada","tipo":"codigo","quien":"sala","funcion":"segunda_mirada","condicion":{"tipo":"siempre"},"entrada":["mesa"],"salida_artefacto":"segunda_mirada","tope_usd":0.5,"vuelve_a":{"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"segunda_mirada","campo":"vuelve_a_la_mesa","igual":true}}}$s$::jsonb, 1
      WHERE p->>'clave' IN ('borrador_imagen', 'imagenes_clave')
    ) y
  )
  WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa')
    AND NOT EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN
    RAISE EXCEPTION '202611201200: hay encargos vivos de post_mesa, carrusel_mesa, kit_mesa o video_mesa (también los que esperan al dueño); esperar a que cierren (filas cambiadas: %)', n;
  END IF;
END $$;

DO $$
DECLARE t text; orden text;
BEGIN
  FOREACH t IN ARRAY ARRAY['post_mesa', 'carrusel_mesa', 'kit_mesa'] LOOP
    SELECT string_agg(p->>'clave', ',' ORDER BY i) INTO orden FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE g.tipo = t;
    IF orden NOT LIKE '%,mesa,borrador_imagen,segunda_mirada,aprobar_propuestas,imagen,%' THEN
      RAISE EXCEPTION '202611201200: % no quedó con mesa → borrador_imagen → segunda_mirada → aprobar_propuestas (%)', t, orden;
    END IF;
  END LOOP;
  SELECT string_agg(p->>'clave', ',' ORDER BY i) INTO orden FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE g.tipo = 'video_mesa';
  IF orden NOT LIKE '%,mesa,imagenes_clave,segunda_mirada,borrador_video,aprobar_propuestas,%' THEN
    RAISE EXCEPTION '202611201200: video_mesa no quedó con mesa → imagenes_clave → segunda_mirada → borrador_video (%)', orden;
  END IF;
END $$;

COMMIT;
