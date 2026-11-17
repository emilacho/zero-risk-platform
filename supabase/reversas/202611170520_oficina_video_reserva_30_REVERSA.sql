-- REVERSA de 202611170520 · lo esperado por video vuelve de US$ 30 a 12 (el `limites` exacto de 202611162300). Exige el dato que dejó la migración. Se niega con encargos vivos.
BEGIN;

DO $$
BEGIN
  -- con CUALQUIER encargo vivo (real o ensayo) no se toca
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611170520 REVERSA: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  -- el dato de antes, ENTERO, es el esperado: si alguien lo cambió, no se pisa
  IF (SELECT limites FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $lim_antes${"margen":50,"tope_encargo_usd":45,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":15},"reserva_por_pieza_usd":30,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}}}$lim_antes$::jsonb THEN
    RAISE EXCEPTION '202611170520 REVERSA: los límites de video_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 45::numeric THEN
    RAISE EXCEPTION '202611170520 REVERSA: el tope del encargo de video_mesa no es el esperado; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo SET limites = $lim${"margen":50,"tope_encargo_usd":45,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":15},"reserva_por_pieza_usd":12,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}}}$lim$::jsonb WHERE familia = 'video_mesa';

DO $$
BEGIN
  IF (SELECT (limites->>'reserva_por_pieza_usd')::numeric FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 12::numeric
     OR (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 45::numeric THEN
    RAISE EXCEPTION '202611170520 REVERSA: video_mesa no quedó con la reserva 12';
  END IF;
END $$;

COMMIT;
