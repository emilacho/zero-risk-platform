-- CEREBRO · 3 COLUMNAS MÁS EN `client_social_images` (la «toma» de la foto) · CC#1 · 2026-10-08 · relevo 19 (firma de Emilio «SI APROBADO»).
-- Las produce la ruta `etiquetar` del cerebro: `con_personas` (¿se ve a alguien?), `tipo_de_toma` (producto · ambiente · personas · texto_afiche · otro) y `formato`
-- (vertical · cuadrado · horizontal, leído de las MEDIDAS de la imagen, sin modelo).
-- 🔴 NO APLICADA al escribirse: se aplica en la PUBLICACIÓN, con respaldo físico del día y 0 corridas vivas, ANTES de fusionar el PR (la ruta nueva escribe estas columnas).
-- 🔴 SOLO ADITIVA: 3 columnas ANULABLES sin valor por defecto, cada una con su restricción de valores (admite NULL). No toca ni borra ninguna fila ni columna existente;
--    las fotos quedan con las 3 en NULL hasta que `etiquetar` las llene (las 16 existentes, con `solo_toma`, tope US$ 0,20).
-- 🔴 IDEMPOTENTE (repetible): ADD COLUMN IF NOT EXISTS; cada restricción va EN LA MISMA sentencia, así que si la columna ya existe no se repite. Sin disparadores, sin índices, sin llaves.
-- 🔴 Una sola transacción. Sin permisos nuevos: la tabla ya tiene seguridad por fila y su política de service_role (no se cambia).
-- ORDEN AL PUBLICAR: (1) respaldo del día + CERO corridas → (2) esta migración → (3) NOTIFY (ya incluido al final) → (4) verificación: las fotos con la misma huella en sus columnas viejas, las 3 columnas en NULL, anon denegado → (5) fusionar.
-- REVERSA: `supabase/reversas/202610080300_cerebro_fotos_toma_REVERSA.sql` (se niega a borrar si alguna columna ya tiene datos).

BEGIN;

ALTER TABLE public.client_social_images
  ADD COLUMN IF NOT EXISTS con_personas  boolean,
  ADD COLUMN IF NOT EXISTS tipo_de_toma  text CONSTRAINT client_social_images_tipo_de_toma_valido CHECK (tipo_de_toma IS NULL OR tipo_de_toma IN ('producto','ambiente','personas','texto_afiche','otro')),
  ADD COLUMN IF NOT EXISTS formato       text CONSTRAINT client_social_images_formato_valido CHECK (formato IS NULL OR formato IN ('vertical','cuadrado','horizontal'));

COMMENT ON COLUMN public.client_social_images.con_personas IS 'Si en la foto se ve al menos una persona, según el etiquetador del cerebro (relevo 19). Nadie más la escribe ni la lee.';
COMMENT ON COLUMN public.client_social_images.tipo_de_toma IS 'De qué trata la foto: producto | ambiente | personas | texto_afiche | otro, según el etiquetador del cerebro. Nadie más la escribe ni la lee.';
COMMENT ON COLUMN public.client_social_images.formato      IS 'vertical | cuadrado | horizontal, leído de las medidas de la imagen (sin modelo) por el etiquetador del cerebro. Nadie más la escribe ni la lee.';

COMMIT;

-- 🔴 una columna nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
