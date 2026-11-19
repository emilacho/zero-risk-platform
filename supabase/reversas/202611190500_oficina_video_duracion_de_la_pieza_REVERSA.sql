-- REVERSA de 202611190500 · `limites.video` de `video_mesa` vuelve a lo que dejó 202611190330: `segundos_max` 15, sin `duracion_por_omision_s`, columna 117.9 · CC5 · US$ 0
-- Se niega con encargos vivos y si el dato no es el esperado. OJO: el código de G5b sin esta fila sigue funcionando (sin el dato usa 15 s por omisión; el máximo es 15).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND NOT (
       EXISTS (SELECT 1 FROM public.oficina_turnos t WHERE t.encargo_id = e.id AND t.estado IN ('pendiente', 'corriendo') AND t.tipo = 'dueno')
       AND NOT EXISTS (SELECT 1 FROM public.oficina_turnos t WHERE t.encargo_id = e.id AND t.estado IN ('pendiente', 'corriendo') AND t.tipo <> 'dueno'))) THEN
    RAISE EXCEPTION '202611190500 (reversa): hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT limites FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $lim_antes${"margen":50,"tope_encargo_usd":45,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":120,"plano_por_plano":true,"propuestas":3,"borrador":{"activo":false,"resolucion":"480p"},"duracion_por_omision_s":15},"reserva_por_pieza_usd":30,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}},"tope_encargo_usd_por_segundo":{"720p":4.86,"1080p":4.9}}$lim_antes$::jsonb THEN
    RAISE EXCEPTION '202611190500 (reversa): los límites de video_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 628.2::numeric THEN
    RAISE EXCEPTION '202611190500 (reversa): el tope del encargo de video_mesa no es el esperado (628.2); no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
  SET tope_encargo_usd = 117.9,
      limites = $lim${"margen":50,"tope_encargo_usd":45,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"plano_por_plano":true,"propuestas":3,"borrador":{"activo":false,"resolucion":"480p"}},"reserva_por_pieza_usd":30,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}},"tope_encargo_usd_por_segundo":{"720p":4.86,"1080p":4.9}}$lim$::jsonb,
      version = version + 1
  WHERE familia = 'video_mesa';

DO $$
BEGIN
  -- la columna = lo calculado a la resolución de la plantilla: fijo + cifra por segundo × segundos_max (el TECHO de la familia; cada encargo reserva lo de SU duración)
  IF (SELECT (limites->>'tope_encargo_usd')::numeric + (limites->'tope_encargo_usd_por_segundo'->>(limites->'video'->>'resolucion'))::numeric * (limites->'video'->>'segundos_max')::numeric
        FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa')
     IS DISTINCT FROM (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa')
     OR (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 117.9::numeric
     OR (SELECT limites FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $lim${"margen":50,"tope_encargo_usd":45,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"plano_por_plano":true,"propuestas":3,"borrador":{"activo":false,"resolucion":"480p"}},"reserva_por_pieza_usd":30,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}},"tope_encargo_usd_por_segundo":{"720p":4.86,"1080p":4.9}}$lim$::jsonb THEN
    RAISE EXCEPTION '202611190500 (reversa): los límites no quedaron, o no dan la columna (117.9)';
  END IF;
END $$;

COMMIT;
