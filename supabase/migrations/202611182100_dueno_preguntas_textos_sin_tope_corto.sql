-- 18-nov · G2 «nada se recorta» (CC5) · GO de Lenovo 15:52Z: los textos del dueño pasan al tope único de 100.000 (TOPE_DEL_TEXTO_DEL_DUENO)
-- dueno_preguntas tenía tema 80, pregunta 600, supuesto 2.000 y respuesta 2.000. La LLAVE del tema (tema_norm, de temaNormal) no cambia.
-- Solo amplía: ninguna fila cambia. Nombres leídos de pg_constraint en producción el 18-nov.
BEGIN;
ALTER TABLE public.dueno_preguntas DROP CONSTRAINT IF EXISTS dueno_preguntas_tema_check;
ALTER TABLE public.dueno_preguntas ADD CONSTRAINT dueno_preguntas_tema_check CHECK (char_length(tema) BETWEEN 1 AND 100000);
ALTER TABLE public.dueno_preguntas DROP CONSTRAINT IF EXISTS dueno_preguntas_pregunta_check;
ALTER TABLE public.dueno_preguntas ADD CONSTRAINT dueno_preguntas_pregunta_check CHECK (char_length(pregunta) BETWEEN 1 AND 100000);
ALTER TABLE public.dueno_preguntas DROP CONSTRAINT IF EXISTS dueno_preguntas_supuesto_check;
ALTER TABLE public.dueno_preguntas ADD CONSTRAINT dueno_preguntas_supuesto_check CHECK (supuesto IS NULL OR char_length(supuesto) BETWEEN 1 AND 100000);
ALTER TABLE public.dueno_preguntas DROP CONSTRAINT IF EXISTS dueno_preguntas_respuesta_check;
ALTER TABLE public.dueno_preguntas ADD CONSTRAINT dueno_preguntas_respuesta_check CHECK (respuesta IS NULL OR char_length(respuesta) BETWEEN 1 AND 100000);
COMMIT;
NOTIFY pgrst, 'reload schema';
