-- 18-nov · G2b «nada se recorta» (CC5): el motivo con que Emilio descarta una pregunta pasa de 300 al tope único del texto del dueño (100.000)
-- Va después de 202611182100 (#1187). Solo amplía: ninguna fila cambia. Nombre leído de pg_constraint en producción el 18-nov.
BEGIN;
ALTER TABLE public.dueno_preguntas DROP CONSTRAINT IF EXISTS dueno_preguntas_motivo_check;
ALTER TABLE public.dueno_preguntas ADD CONSTRAINT dueno_preguntas_motivo_check CHECK (motivo IS NULL OR char_length(motivo) BETWEEN 1 AND 100000);
COMMIT;
NOTIFY pgrst, 'reload schema';
