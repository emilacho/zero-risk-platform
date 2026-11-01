-- REVERSA de 202610312009 · quita la regla de promesas sin fuente de la indicación de fondo de la política `pieza`.
BEGIN;
UPDATE public.jefatura_grading_policies
   SET indicacion_fondo = btrim(split_part(indicacion_fondo, ' Promesas sin fuente:', 1))
 WHERE artifact_type = 'pieza' AND indicacion_fondo LIKE '%Promesas sin fuente:%';
COMMIT;
NOTIFY pgrst, 'reload schema';
