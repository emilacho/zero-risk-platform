-- 11-nov · GO Lenovo 03:55Z · regla #17 del barrido · LA PROPORCIÓN DEL FORMATO ES UN DATO DE UNA SOLA COLUMNA.
--   Antes: la hoja de la cadena tenía su tabla en código (`hoja.ts PROPORCION_POR_FORMATO`, video = 9:16) y el brazo de video otra (`RELACION_POR_FORMATO`, video = 16:9).
--   Ahora: `cadena_formatos_por_red.proporcion` por (red, formato). La hoja la escribe en LÍMITES del brief, la oficina la lee del brief y la manda en el pedido al brazo.
--   Columna vacía (NULL) = la proporción por omisión del formato que ya tenía la hoja (único respaldo, sin cambio de conducta).
--   Valores: los mismos que hoy usa la hoja para cada formato (sin cambio), MÁS youtube·video = 16:9 (el video largo; no tiene sala todavía, FIRMA 01-nov).
--   foto · anuncio_* · texto quedan NULL a propósito: hoy la hoja les da 1:1 y no se cambia aquí (se cambia como dato, con firma).
--   Aditiva e idempotente: columna nueva nullable + UPDATE solo donde está NULL. NO APLICADA: la certifica CC6 y se aplica al publicar.
--   Reversa: supabase/reversas/202611111400_cadena_formatos_proporcion_REVERSA.sql
BEGIN;

ALTER TABLE public.cadena_formatos_por_red ADD COLUMN IF NOT EXISTS proporcion text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cadena_formatos_proporcion_valida') THEN
    ALTER TABLE public.cadena_formatos_por_red
      ADD CONSTRAINT cadena_formatos_proporcion_valida CHECK (proporcion IS NULL OR proporcion IN ('16:9','4:3','1:1','3:4','4:5','9:16','21:9'));
  END IF;
END $$;

UPDATE public.cadena_formatos_por_red SET proporcion = '16:9'
 WHERE proporcion IS NULL AND red = 'youtube' AND formato = 'video';

UPDATE public.cadena_formatos_por_red AS f SET proporcion = v.p
  FROM (VALUES ('imagen','4:5'), ('carrusel','4:5'), ('historia','9:16'), ('estado','9:16'), ('reel','9:16'), ('video','9:16'), ('short','9:16'), ('tiktok','9:16'), ('kit','9:16')) AS v(formato, p)
 WHERE f.proporcion IS NULL AND f.formato = v.formato AND NOT (f.red = 'youtube' AND f.formato = 'video');

COMMENT ON COLUMN public.cadena_formatos_por_red.proporcion IS 'CADENA · proporción del cuadro de este (red, formato), p. ej. 9:16. La escribe la hoja en LÍMITES del brief y la lleva la oficina en el pedido al brazo de video. NULL = la de por omisión del formato (hoja.ts PROPORCION_POR_FORMATO; 1:1 si el formato no está). Regla #17, 11-nov.';

DO $$
DECLARE corto int; largo text;
BEGIN
  SELECT count(*) INTO corto FROM public.cadena_formatos_por_red WHERE familia = 'video_mesa' AND proporcion IS DISTINCT FROM '9:16';
  SELECT proporcion INTO largo FROM public.cadena_formatos_por_red WHERE red = 'youtube' AND formato = 'video';
  IF corto <> 0 THEN RAISE EXCEPTION 'hay % formatos de video corto (video_mesa) sin proporción 9:16', corto; END IF;
  IF largo IS DISTINCT FROM '16:9' THEN RAISE EXCEPTION 'youtube · video debería quedar 16:9 y quedó %', largo; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
