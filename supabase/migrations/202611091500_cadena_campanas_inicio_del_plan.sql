-- 09-nov · GO Lenovo (firma de Emilio, D) · CC#2 · US$ 0.
--   La campaña hereda la ventana del plan aprobado: su fecha de inicio puede salir del PLAN. Se admite el origen 'plan' junto a los de siempre.
--   Solo amplía una lista: ninguna fila existente cambia.
BEGIN;
ALTER TABLE public.cadena_campanas DROP CONSTRAINT IF EXISTS cadena_campanas_inicio_origen_valido;
ALTER TABLE public.cadena_campanas ADD CONSTRAINT cadena_campanas_inicio_origen_valido CHECK (fecha_inicio_origen IN ('regla','alta','emilio','plan'));
COMMIT;
