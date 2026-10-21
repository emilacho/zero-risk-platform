-- Reversa de 202610202100_jefatura_tope_del_revisor: vuelve el tope por llamada del revisor de fondo a 0,20.
UPDATE public.jefatura_grading_policies
   SET tope_paso_usd = jsonb_set(tope_paso_usd, '{revision_fondo}', '0.2'::jsonb)
 WHERE artifact_type IN ('plan', 'estrategia', 'calendario', 'brief')
   AND tope_paso_usd IS NOT NULL;
