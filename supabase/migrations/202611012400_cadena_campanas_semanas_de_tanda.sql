-- 01-nov · firma de Emilio: cada campaña puede tener su propio tamaño de tanda. Sin valor vale 4 semanas (por código).
-- Los días de la campaña no necesitan columna: salen de fecha_inicio y fecha_fin.
ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS semanas_de_tanda integer;
ALTER TABLE public.cadena_campanas DROP CONSTRAINT IF EXISTS cadena_campanas_semanas_de_tanda_valida;
ALTER TABLE public.cadena_campanas ADD CONSTRAINT cadena_campanas_semanas_de_tanda_valida CHECK (semanas_de_tanda IS NULL OR semanas_de_tanda > 0);
