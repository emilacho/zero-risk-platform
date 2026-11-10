-- Reversa de 202611110100_cadena_campanas_tope_de_gasto.sql · quita la columna (y con ella el tope de cada campaña) y su regla.
-- OJO: después de la reversa, el código del freno ve todas las campañas SIN tope y no suelta piezas reales; revertir también el código o publicar antes la versión sin freno.
BEGIN;
ALTER TABLE public.cadena_campanas DROP CONSTRAINT IF EXISTS cadena_campanas_tope_gasto_positivo;
ALTER TABLE public.cadena_campanas DROP COLUMN IF EXISTS tope_gasto_usd;
COMMIT;
