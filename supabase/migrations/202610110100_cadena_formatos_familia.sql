-- r63 (CC#1 2026-10-11) · relevo 61 · de qué FAMILIA de la oficina es cada formato del calendario (por DATO, agnóstico: el código no sabe de rubros).
-- La parte «por filas» copia esta familia al brief de cada fila; quien emita el sobre `brief/parte-listo · producir` la lee de ahí.
-- Solo los formatos que HOY tienen sala llevan familia; el resto queda NULL y va a la pieza simple, como hoy.
-- Aditiva e idempotente: una columna opcional + un UPDATE que no pisa lo ya escrito. Reversa: ALTER TABLE ... DROP COLUMN familia.
ALTER TABLE public.cadena_formatos_por_red ADD COLUMN IF NOT EXISTS familia text;
DO $cadena$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cadena_formatos_familia_valida') THEN
    ALTER TABLE public.cadena_formatos_por_red ADD CONSTRAINT cadena_formatos_familia_valida CHECK (familia IS NULL OR familia ~ '^[a-z][a-z0-9_]{0,39}$');
  END IF;
END
$cadena$;

UPDATE public.cadena_formatos_por_red SET familia = 'post_img'       WHERE familia IS NULL AND formato = 'foto';
UPDATE public.cadena_formatos_por_red SET familia = 'carrusel_ig_v1' WHERE familia IS NULL AND formato = 'carrusel';
UPDATE public.cadena_formatos_por_red SET familia = 'kit_historias'  WHERE familia IS NULL AND formato IN ('historia', 'estado');

COMMENT ON COLUMN public.cadena_formatos_por_red.familia IS 'CADENA · familia de la oficina de creativos que produce este formato (post_img · carrusel_ig_v1 · kit_historias). NULL = sin sala: va a la pieza simple.';
