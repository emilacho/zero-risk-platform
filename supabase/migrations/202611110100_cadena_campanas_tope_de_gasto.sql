-- 10-nov · GO Lenovo 19:30Z (opción A) + decisión de Emilio 19:40Z («hagamos la primera semana, mantén») · CC1 · US$ 0.
--   TOPE DE GASTO POR CAMPAÑA: el freno de autoproducir (`src/lib/cadena/tope-de-campana.ts`) lee el tope de LA CAMPAÑA, no de un número en el código.
--   · columna nueva, nula por omisión: una campaña SIN tope no produce piezas reales (el freno pregunta una vez por el buzón);
--   · solo números positivos;
--   · la campaña viva de Náufrago (28de888e) recibe US$ 40, el monto que firmó Emilio (`raw/tasks/2026-11-10-DALE-EMILIO-tope-campana-naufrago-40.md`
--     y `2026-11-10-DECISION-EMILIO-a-CC1-CC7-CC6-tope-40-primera-semana.md`); solo si todavía no tiene tope (repetir la migración no pisa un cambio posterior).
--   No toca permisos: la columna hereda los de la tabla. Ninguna otra fila cambia.
-- Reversa exacta: supabase/reversas/202611110100_cadena_campanas_tope_de_gasto_REVERSA.sql
BEGIN;
ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS tope_gasto_usd numeric NULL;
ALTER TABLE public.cadena_campanas DROP CONSTRAINT IF EXISTS cadena_campanas_tope_gasto_positivo;
ALTER TABLE public.cadena_campanas ADD CONSTRAINT cadena_campanas_tope_gasto_positivo CHECK (tope_gasto_usd IS NULL OR tope_gasto_usd > 0);
COMMENT ON COLUMN public.cadena_campanas.tope_gasto_usd IS 'Tope de gasto de la campaña en US$ (planeación + concepto + brief + piezas). Sin valor = no produce piezas reales. Lo decide una persona.';
UPDATE public.cadena_campanas SET tope_gasto_usd = 40 WHERE id = '28de888e-b3f2-4aca-86b3-2c7f7bf6685a' AND tope_gasto_usd IS NULL;
COMMIT;
