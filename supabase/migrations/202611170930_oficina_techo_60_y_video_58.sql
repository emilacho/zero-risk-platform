-- 202611170930 · TECHO TÉCNICO DE LA BASE 50 → 60 + el encargo de video ENCENDIDO 45 → 58 · CC1 · RESPUESTA Lenovo «check-base-60» + regla de Emilio 08:06 (los topes no cortan trabajo a medias)
-- La cuenta del motor HASTA EL CIERRE, peor caso con 2 rondas de cambios del dueño y el video cobrando su tope (15): gasta 52,08. Con 45 se cortaba antes del video; con 52, antes de
--   la entrega (CC6); 53 es el mínimo; DECISIÓN Lenovo: 58 (margen, incluye las correcciones de largo). La base no aceptaba más de 50 por encargo ni por plantilla: las dos reglas pasan a 60 (ninguna otra familia cambia su tope).
-- Límites EXACTOS antes = los de 202611170720; después = los de VIDEO_MESA_ENCENDIDA (solo cambia `tope_encargo_usd`). Pasos, familias activas y reserva (30) no cambian.
-- Se niega con encargos vivos y si el dato no es el esperado. Reversa: reversas/202611170930_oficina_techo_60_y_video_58_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611170930: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT limites FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM $lim_antes${"margen":50,"tope_encargo_usd":45,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":15,"plano_por_plano":true,"propuestas":3,"borrador":{"resolucion":"480p"}},"reserva_por_pieza_usd":30,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}}}$lim_antes$::jsonb THEN
    RAISE EXCEPTION '202611170930: los límites de video_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 45::numeric THEN
    RAISE EXCEPTION '202611170930: el tope del encargo de video_mesa no es el esperado; no se pisa';
  END IF;
END $$;

ALTER TABLE public.oficina_encargos DROP CONSTRAINT IF EXISTS oficina_encargos_tope_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= 60);
ALTER TABLE public.oficina_tipos_de_grupo DROP CONSTRAINT IF EXISTS oficina_tipos_tope_valido;
ALTER TABLE public.oficina_tipos_de_grupo ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 60);

UPDATE public.oficina_tipos_de_grupo SET tope_encargo_usd = 58, limites = $lim${"margen":50,"tope_encargo_usd":58,"max_rondas":2,"imagenes_generadas_max":0,"reuso_dias":14,"plataforma":"instagram-reel","pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"video":{"resolucion":"720p","segundos_min":8,"segundos_max":15,"tope_por_video_usd":15,"plano_por_plano":true,"propuestas":3,"borrador":{"resolucion":"480p"}},"reserva_por_pieza_usd":30,"imagen_clave":{"borrador":{"quality":"low","size":"1024x1536"},"final":{"quality":"max","size":"1024x1536"}}}$lim$::jsonb WHERE familia = 'video_mesa';

DO $$
BEGIN
  IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 58::numeric
     OR (SELECT (limites->>'tope_encargo_usd')::numeric FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 58::numeric THEN
    RAISE EXCEPTION '202611170930: el video no quedó en 58';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('oficina_encargos_tope_valido', 'oficina_tipos_tope_valido') AND pg_get_constraintdef(oid) LIKE '%<= (60)%') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION '202611170930: las dos reglas no quedaron en 60';
  END IF;
END $$;

COMMIT;
