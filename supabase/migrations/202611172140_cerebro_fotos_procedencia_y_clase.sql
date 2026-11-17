-- 17-nov · ENCARGO 1 de Cerebro (firma de Emilio): cada imagen guardada lleva su PROCEDENCIA, su LUGAR (la oferta y, si es física, la sede) y su FECHA con la fuente de cada dato;
-- y una captura de pantalla de la web deja de ser «foto propia»: se queda entera, con su clase propia, fuera de la lista de fotos.
-- Solo AGREGA columnas (todas vacías o con el valor de siempre): no borra ni cambia ninguna fila. Lo ya guardado se completa aparte, con respaldo y reversa.
-- `procedencia` y no `origen`: `origen` ya nombra en las lecturas si la foto es propia, de la competencia o de referencia.
ALTER TABLE public.client_social_images
  ADD COLUMN IF NOT EXISTS clase          text NOT NULL DEFAULT 'foto',
  ADD COLUMN IF NOT EXISTS clase_motivo   text,
  ADD COLUMN IF NOT EXISTS procedencia    text,
  ADD COLUMN IF NOT EXISTS oferta         text,
  ADD COLUMN IF NOT EXISTS sede_id        uuid REFERENCES public.client_sedes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lugar_fuente   text,
  ADD COLUMN IF NOT EXISTS fecha_origen   timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_fuente   text;

DO $csi$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_clase_valida') THEN
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_clase_valida CHECK (clase IN ('foto','captura_web'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_captura_con_motivo') THEN
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_captura_con_motivo CHECK (clase = 'foto' OR clase_motivo IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_procedencia_valida') THEN
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_procedencia_valida CHECK (procedencia IS NULL OR procedencia IN ('sitio_web','mapas','instagram','facebook','tiktok','youtube','x','linkedin','dueno','otro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_lugar_con_fuente') THEN
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_lugar_con_fuente CHECK ((oferta IS NULL AND sede_id IS NULL) OR lugar_fuente IN ('mapas','dueno','publicacion'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_fecha_con_fuente') THEN
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_fecha_con_fuente CHECK (fecha_origen IS NULL OR fecha_fuente IN ('publicacion','mapas','metadatos','dueno'));
  END IF;
END
$csi$;

COMMENT ON COLUMN public.client_social_images.clase IS 'foto = foto o ilustración del cliente; captura_web = captura de pantalla de una página o red (se guarda entera, pero no se sirve como foto propia). Cambiarla exige clase_motivo.';
COMMENT ON COLUMN public.client_social_images.procedencia IS 'De dónde se copió: sitio_web | mapas | instagram | facebook | tiktok | youtube | x | linkedin | dueno | otro. Vacía = se deduce de tipo/post_url al leer.';
COMMENT ON COLUMN public.client_social_images.oferta IS 'La oferta a la que pertenece (sede, producto, plan, servicio, línea o evento), con la misma clave que los hechos del negocio. Vacía = no consta.';
COMMENT ON COLUMN public.client_social_images.sede_id IS 'La sede, cuando la oferta es física. Vacía = no consta.';
COMMENT ON COLUMN public.client_social_images.fecha_origen IS 'Fecha de la imagen según fecha_fuente (metadatos = la que trae el archivo; Google la reescribe y puede ser la de subida). Vacía: se usa posted_at (publicación) o no consta.';

NOTIFY pgrst, 'reload schema';
