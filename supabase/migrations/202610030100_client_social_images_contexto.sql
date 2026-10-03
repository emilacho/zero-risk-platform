-- CADA FOTO VIAJA CON TODO SU CONTEXTO · CC#1 · 2026-10-03 (encargo Lenovo «cada foto viaja con todo su contexto» punto 1).
-- 🔴 NO APLICADA al escribirse: se aplica en la PUBLICACIÓN, con aviso previo y GO de Emilio. ADITIVA: sólo agrega columnas con valor por defecto; no toca ni borra ninguna fila ni ninguna columna.
--
-- Hasta hoy una foto guardaba `post_id · tipo · url`: el texto del post, la fecha, el enlace, la posición en el carrusel y el medio real (reel/video/imagen) se perdían al copiar y el productor
-- recibía píxeles con un código opaco. Ahora cada fila guarda su contexto, con la procedencia de lo que se sabe del producto.
--
-- ORDEN AL PUBLICAR: (1) esta migración (+ el NOTIFY del final: sin él PostgREST no ve las columnas nuevas) → (2) completar las filas viejas desde `apify_raw` (script `completar-contexto-fotos.mjs`) →
-- (3) el Servicio de Apify (`construir-contexto-fotos.mjs`) → (4) el flujo de la pieza. Con el orden cambiado los nodos fallan ALTO (columna inexistente), nunca en silencio.
ALTER TABLE public.client_social_images
  ADD COLUMN IF NOT EXISTS caption                  text,
  ADD COLUMN IF NOT EXISTS posted_at                timestamptz,
  ADD COLUMN IF NOT EXISTS post_url                 text,
  ADD COLUMN IF NOT EXISTS posicion                 text,
  ADD COLUMN IF NOT EXISTS medio                    text,
  ADD COLUMN IF NOT EXISTS hash_archivo             text,
  ADD COLUMN IF NOT EXISTS duplicado_de             uuid REFERENCES public.client_social_images(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS producto                 text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS producto_fuente          text   NOT NULL DEFAULT 'desconocido',
  ADD COLUMN IF NOT EXISTS producto_evidencia       text,
  ADD COLUMN IF NOT EXISTS contexto_completado_en   timestamptz;

-- los valores permitidos (agregados aparte para que la migración sea repetible)
DO $csi$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_posicion_valida') THEN
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_posicion_valida CHECK (posicion IS NULL OR posicion IN ('unica','portada') OR posicion ~ '^hijo-[0-9]+$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_medio_valido') THEN
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_medio_valido CHECK (medio IS NULL OR medio IN ('imagen','video','reel','logo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_producto_fuente_valida') THEN
    -- caption = lo dijo el texto del post · vision = la pasada de visión (APAGADA, requiere GO) · dueno = lo corrigió el dueño y GANA · conflicto = texto y visión chocan: NO se usa · desconocido = nadie lo dijo
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_producto_fuente_valida CHECK (producto_fuente IN ('caption','vision','dueno','conflicto','desconocido'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csi_no_duplicado_de_si_mismo') THEN
    ALTER TABLE public.client_social_images ADD CONSTRAINT csi_no_duplicado_de_si_mismo CHECK (duplicado_de IS NULL OR duplicado_de <> id);
  END IF;
END
$csi$;

CREATE INDEX IF NOT EXISTS csi_por_huella ON public.client_social_images (client_id, hash_archivo) WHERE hash_archivo IS NOT NULL;
CREATE INDEX IF NOT EXISTS csi_por_post ON public.client_social_images (client_id, owner_role, handle, posted_at DESC);

COMMENT ON COLUMN public.client_social_images.duplicado_de IS 'Si esta fila es la MISMA imagen que otra del mismo post (la portada de un carrusel es su hijo 1), apunta a la que se queda. Los lectores la saltan; no se borra ninguna fila.';
COMMENT ON COLUMN public.client_social_images.producto_fuente IS 'De dónde salió `producto`: caption | vision | dueno | conflicto | desconocido. «dueno» gana siempre; «conflicto» y «desconocido» no se usan como referencia de un producto.';

-- 🔴 una columna o tabla nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct: 404 hasta este aviso)
NOTIFY pgrst, 'reload schema';
