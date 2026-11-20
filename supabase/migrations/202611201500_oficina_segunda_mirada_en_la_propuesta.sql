-- 202611201500 · EL SEGUNDO DOCTOR CREATIVO EN LA PROPUESTA (post_mesa · carrusel_mesa · kit_mesa · video_mesa) · CC4 · PLAN v4 (🟢 CC7 11:26Z · 🟢 condicionado CC6 11:26Z · LENOVO 11:27Z) · US$ 0
-- Solo DATO: es exactamente `conSegundaMirada(fila viva)` de src/lib/oficina/segunda-mirada.ts.
--   · un paso nuevo `segunda_mirada` (código, tope 0,5, vuelve a la mesa máx. 1 por su propio contador)
--   · imagen: justo después de `borrador_imagen` (antes de `aprobar_propuestas`) · video: justo después de `imagenes_clave` (antes de `borrador_video`)
-- Va DESPUÉS de #1250 (202611201400, la corrección de CC1): exige lo que esa dejó en vivo y suma lo suyo encima (trato de los papeles, 16:01Z).
-- Sube la RESERVA POR PIEZA de las 3 mesas de imagen (punto 1 de CC7 en #1251): post 3,35 → 5,91 · carrusel y kit 4,00 → 6,56 (GPT ~0,03 + la vuelta a la mesa 2,53, contada siempre).
-- Sube el TOPE del encargo de las 3 mesas de imagen (columna y límite): post 43 → 45 · carrusel y kit 45 → 48. Es el peor caso con la vuelta de GPT,
--   medido en seco sobre las filas vivas después de #1250: 44,52 / 47,47 / 47,47 (regla 2–3× de Emilio; un tope no es gasto).
-- No toca el video (ni su tope ni su reserva), cota, margen, indicaciones, modelos, activo ni los demás pasos. version + 1 en las 4.
-- GUARDA (CC6 9 · CC7 11:27Z): el motor ubica a la pieza por POSICIÓN (`ultimo`) y lee la plantilla viva; meter un paso corre un lugar todo lo que sigue.
--   Por eso se niega con CUALQUIER encargo vivo de esas 4 familias, también el que solo espera al dueño (más estricta que 202611172100),
--   y la guarda va DENTRO del mismo UPDATE, con la tabla de encargos bloqueada para escritura hasta el COMMIT: no entra un encargo entre mirar y cambiar.
-- Reversa: supabase/reversas/202611201500_oficina_segunda_mirada_en_la_propuesta_REVERSA.sql
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
      RAISE EXCEPTION '202611201500: no existe la fila %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = t AND (p->>'clave' = 'segunda_mirada' OR p->>'funcion' = 'segunda_mirada')) THEN
      RAISE EXCEPTION '202611201500: % ya tiene la segunda mirada; no se pisa', t;
    END IF;
    IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = t AND p->>'clave' IN ('borrador_imagen', 'imagenes_clave')) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION '202611201500: % no tiene exactamente un borrador_imagen o un imagenes_clave; no se sabe dónde va', t;
    END IF;
  END LOOP;
  -- en el video, el imagenes_clave elegido es el de las PROPUESTAS (lo sigue borrador_video), no el final
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY AS a(p, i), jsonb_array_elements(g.pasos) WITH ORDINALITY AS b(q, k)
                 WHERE g.tipo = 'video_mesa' AND a.p->>'clave' = 'imagenes_clave' AND b.q->>'clave' = 'borrador_video' AND b.k = a.i + 1) THEN
    RAISE EXCEPTION '202611201500: en video_mesa, imagenes_clave no va seguido de borrador_video; no se toca';
  END IF;
  -- la reserva por pieza leída (la que dejó 202611201400 sobre la de 202611201330)
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 3.35) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND (g.limites->>'reserva_por_pieza_usd')::numeric = 4)) <> 3 THEN
    RAISE EXCEPTION '202611201500: la reserva por pieza de las 3 mesas de imagen no es la leída (3.35/4/4); no se toca';
  END IF;
  -- el tope leído (el que dejó 202611201100), en columna y límite
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND g.tope_encargo_usd = 43 AND (g.limites->>'tope_encargo_usd')::numeric = 43) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = 45 AND (g.limites->>'tope_encargo_usd')::numeric = 45)) <> 3 THEN
    RAISE EXCEPTION '202611201500: el tope de las 3 mesas de imagen no es el leído (43/45/45); no se toca';
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
  ), version = g.version + 1
  WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa')
    AND NOT EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN
    RAISE EXCEPTION '202611201500: hay encargos vivos de post_mesa, carrusel_mesa, kit_mesa o video_mesa (también los que esperan al dueño); esperar a que cierren (filas cambiadas: %)', n;
  END IF;
END $$;

-- la reserva por pieza y el tope (misma transacción: los encargos siguen bloqueados y ya se comprobó que no hay vivos)
UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 45, limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 5.91, 'tope_encargo_usd', 45)
WHERE g.tipo = 'post_mesa';

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 48, limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 6.56, 'tope_encargo_usd', 48)
WHERE g.tipo = 'carrusel_mesa';

UPDATE public.oficina_tipos_de_grupo g
SET tope_encargo_usd = 48, limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', 6.56, 'tope_encargo_usd', 48)
WHERE g.tipo = 'kit_mesa';

DO $$
DECLARE t text; orden text;
BEGIN
  FOREACH t IN ARRAY ARRAY['post_mesa', 'carrusel_mesa', 'kit_mesa'] LOOP
    SELECT string_agg(p->>'clave', ',' ORDER BY i) INTO orden FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE g.tipo = t;
    IF orden NOT LIKE '%,mesa,borrador_imagen,segunda_mirada,aprobar_propuestas,imagen,%' THEN
      RAISE EXCEPTION '202611201500: % no quedó con mesa → borrador_imagen → segunda_mirada → aprobar_propuestas (%)', t, orden;
    END IF;
  END LOOP;
  SELECT string_agg(p->>'clave', ',' ORDER BY i) INTO orden FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE g.tipo = 'video_mesa';
  IF orden NOT LIKE '%,mesa,imagenes_clave,segunda_mirada,borrador_video,aprobar_propuestas,%' THEN
    RAISE EXCEPTION '202611201500: video_mesa no quedó con mesa → imagenes_clave → segunda_mirada → borrador_video (%)', orden;
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = 5.91) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND (g.limites->>'reserva_por_pieza_usd')::numeric = 6.56)) <> 3 THEN
    RAISE EXCEPTION '202611201500: la reserva por pieza no quedó en 5.91/6.56/6.56';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g WHERE (g.tipo = 'post_mesa' AND g.tope_encargo_usd = 45 AND (g.limites->>'tope_encargo_usd')::numeric = 45) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = 48 AND (g.limites->>'tope_encargo_usd')::numeric = 48)) <> 3 THEN
    RAISE EXCEPTION '202611201500: el tope no quedó en 45/48/48';
  END IF;
END $$;

COMMIT;
