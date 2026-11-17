-- REVERSA de 202611171200_oficina_rejas_carrusel_texto_del_autor: devuelve las 2 reglas viejas EXACTAS del carrusel. Se niega con encargos vivos o si no encuentra las nuevas exactas.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171200-reversa: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'content-creator') r WHERE r->>'regla' = $t$Entregas el texto base de la pieza, el pie de foto y los hashtags en campos aparte; el diseñador arma el texto de cada lámina a partir de lo que escribiste, así que escribe ahí todo lo que irá en las láminas.$t$) = 1 AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'carousel-designer') r WHERE r->>'regla' = $t$El texto de las láminas sale del texto del autor (content-creator): lo recortas y, si hace falta para que entre o se lea mejor, ajustas palabras sin cambiar lo que dice ni agregar datos, cifras o promesas. Lo que no sea un trozo exacto queda anotado como sugerencia para la revisión.$t$) = 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171200-reversa: la plantilla del carrusel no trae las 2 reglas nuevas exactas; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{content-creator}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $de$Entregas el texto base de la pieza, el pie de foto y los hashtags en campos aparte; el diseñador arma el texto de cada lámina a partir de lo que escribiste, así que escribe ahí todo lo que irá en las láminas.$de$ THEN jsonb_set(r, '{regla}', to_jsonb($a$Entregas el texto base de la pieza, el pie de foto y los hashtags en campos aparte; el texto de cada lámina lo recorta el diseñador LITERALMENTE de lo que escribiste, así que escribe ahí todo lo que irá en las láminas.$a$::text)) ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'content-creator') WITH ORDINALITY AS t(r, o)
))
WHERE familia = 'carrusel_ig_v1';

UPDATE public.oficina_tipos_de_grupo
SET indicaciones = jsonb_set(indicaciones, '{carousel-designer}', (
  SELECT jsonb_agg(CASE WHEN r->>'regla' = $de$El texto de las láminas sale del texto del autor (content-creator): lo recortas y, si hace falta para que entre o se lea mejor, ajustas palabras sin cambiar lo que dice ni agregar datos, cifras o promesas. Lo que no sea un trozo exacto queda anotado como sugerencia para la revisión.$de$ THEN jsonb_set(r, '{regla}', to_jsonb($a$No escribes texto nuevo: recortas LITERALMENTE el texto del autor; cada titular, texto o llamado de una lámina debe ser un trozo exacto de lo que escribió content-creator.$a$::text)) ELSE r END ORDER BY o)
  FROM jsonb_array_elements(indicaciones->'carousel-designer') WITH ORDINALITY AS t(r, o)
))
WHERE familia = 'carrusel_ig_v1';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE indicaciones::text LIKE '%el diseñador arma el texto de cada lámina a partir de lo que escribiste%' OR indicaciones::text LIKE '%ajustas palabras sin cambiar lo que dice ni agregar datos, cifras o promesas%')
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'content-creator') r WHERE r->>'regla' = $t$Entregas el texto base de la pieza, el pie de foto y los hashtags en campos aparte; el texto de cada lámina lo recorta el diseñador LITERALMENTE de lo que escribiste, así que escribe ahí todo lo que irá en las láminas.$t$) = 1 AND (SELECT count(*) FROM jsonb_array_elements(indicaciones->'carousel-designer') r WHERE r->>'regla' = $t$No escribes texto nuevo: recortas LITERALMENTE el texto del autor; cada titular, texto o llamado de una lámina debe ser un trozo exacto de lo que escribió content-creator.$t$) = 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171200-reversa: la plantilla del carrusel no quedó con las 2 reglas nuevas';
  END IF;
END $$;

COMMIT;
