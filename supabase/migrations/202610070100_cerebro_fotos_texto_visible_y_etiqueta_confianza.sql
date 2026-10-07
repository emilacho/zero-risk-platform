-- CEREBRO · 2 COLUMNAS MÁS EN `client_social_images` · CC#2 · 2026-10-07 · PROPUESTA (NO APLICADA) · firma de Emilio 2026-10-07 «si a las dos» + certificación de CC#3.
-- Las produce la ruta `etiquetar` del cerebro (paso 4, de CC#1): `texto_visible` (el texto que se LEE en la foto) y `etiqueta_confianza` (alta | media | baja).
-- 🔴 SOLO ADITIVA: 2 columnas ANULABLES sin valor por defecto. No toca ni borra ninguna fila ni ninguna columna existente; las 16 fotos quedan con estas dos en NULL.
-- 🔴 NADIE las lee ni las escribe todavía salvo el portero del cerebro (la ruta `etiquetar`): una prueba permanente lo vigila (cerebro-paso-2-aislamiento).
-- 🔴 IDEMPOTENTE (repetible): ADD COLUMN IF NOT EXISTS; la restricción de valores va EN LA MISMA sentencia, así que si la columna ya existe no se repite. Sin disparadores, sin índices, sin llaves.
-- 🔴 Una sola transacción. Sin permisos nuevos: la tabla ya tiene seguridad por fila y su política de service_role (no se cambia).
-- ORDEN AL PUBLICAR: (1) respaldo físico del día confirmado y CERO corridas → (2) esta migración → (3) NOTIFY (ya incluido al final) → (4) verificación: las 16 fotos con la misma huella, las 2 columnas en NULL, anon denegado, `indice` del piloto igual.
-- REVERSA: `supabase/reversas/202610070100_cerebro_fotos_texto_visible_y_etiqueta_confianza_REVERSA.sql` (se niega a borrar si alguna columna ya tiene datos).

BEGIN;

ALTER TABLE public.client_social_images
  ADD COLUMN IF NOT EXISTS texto_visible       text,
  ADD COLUMN IF NOT EXISTS etiqueta_confianza  text CONSTRAINT client_social_images_etiqueta_confianza_valida CHECK (etiqueta_confianza IS NULL OR etiqueta_confianza IN ('alta','media','baja'));

COMMENT ON COLUMN public.client_social_images.texto_visible      IS 'Texto que se LEE dentro de la foto, según el etiquetador del cerebro (paso 4). Nadie más la escribe ni la lee. Ver docs/MAPA-2026-10-06-tablas-del-cerebro.md';
COMMENT ON COLUMN public.client_social_images.etiqueta_confianza IS 'Qué tan seguro quedó el etiquetador de lo que escribió sobre la foto: alta | media | baja. Nadie más la escribe ni la lee.';

COMMIT;

-- 🔴 una columna nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
