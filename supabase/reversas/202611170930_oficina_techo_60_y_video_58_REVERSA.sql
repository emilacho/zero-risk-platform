-- REVERSA de 202611170930 · el video vuelve a 45 (límites EXACTOS de 202611170720) y las reglas a (0, 50]. `oficina_encargos_tope_valido` vuelve como NOT VALID: los encargos que ya
--   corrieron con más de 50 quedan en la historia (no se borran ni se tocan) y los NUEVOS no pasan de 50. Se niega con encargos vivos, si el dato no es el que dejó la migración,
--   o si otra plantilla ya pasa de 50 (la regla de las plantillas no se podría volver).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611170930 REVERSA: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT limites FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $lim_antes${"margen":50,"tope_encargo_usd":58,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":15,"plano_por_plano":true,"propuestas":3,"borrador":{"resolucion":"480p"}},"reserva_por_pieza_usd":30,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}}}$lim_antes$::jsonb THEN
    RAISE EXCEPTION '202611170930 REVERSA: los límites de video_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 58::numeric THEN
    RAISE EXCEPTION '202611170930 REVERSA: el tope del encargo de video_mesa no es el esperado; no se pisa';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE familia <> 'video_mesa' AND tope_encargo_usd > 50) THEN
    RAISE EXCEPTION '202611170930 REVERSA: otra plantilla ya pasa de 50; la regla de las plantillas no se puede volver';
  END IF;
END $$;

-- primero el dato (para que la regla de 50 se pueda volver), después las reglas
UPDATE public.oficina_tipos_de_grupo SET tope_encargo_usd = 45, limites = $lim${"margen":50,"tope_encargo_usd":45,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":15,"plano_por_plano":true,"propuestas":3,"borrador":{"resolucion":"480p"}},"reserva_por_pieza_usd":30,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}}}$lim$::jsonb WHERE familia = 'video_mesa';

ALTER TABLE public.oficina_encargos DROP CONSTRAINT IF EXISTS oficina_encargos_tope_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= 50) NOT VALID;
ALTER TABLE public.oficina_tipos_de_grupo DROP CONSTRAINT IF EXISTS oficina_tipos_tope_valido;
ALTER TABLE public.oficina_tipos_de_grupo ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 50);

DO $$
BEGIN
  IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 45::numeric
     OR (SELECT (limites->>'tope_encargo_usd')::numeric FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 45::numeric THEN
    RAISE EXCEPTION '202611170930 REVERSA: el video no quedó en 45';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('oficina_encargos_tope_valido', 'oficina_tipos_tope_valido') AND pg_get_constraintdef(oid) LIKE '%<= (50)%') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION '202611170930 REVERSA: las dos reglas no quedaron en 50';
  END IF;
END $$;

COMMIT;
