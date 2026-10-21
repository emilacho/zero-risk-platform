-- Jefatura · tope por llamada del revisor de fondo (20-oct · CC#1 · parte 1 del encargo de Lenovo · firma de Emilio 20:36).
-- Medido: el revisor (jefe-marketing, Sonnet 4.6) se cortó al revisar un plan con `error_max_budget_usd` (tope 0,20): leer el plan cuesta ≈ 0,13 antes de escribir nada.
-- Plan / estrategia / calendario / brief pasan de 0,20 a 0,40; pieza queda en 0,20. Ya aplicado en vivo por PATCH el 20-oct 18:4xZ: esta migración deja las bases nuevas iguales. Idempotente.
UPDATE public.jefatura_grading_policies
   SET tope_paso_usd = jsonb_set(tope_paso_usd, '{revision_fondo}', '0.4'::jsonb)
 WHERE artifact_type IN ('plan', 'estrategia', 'calendario', 'brief')
   AND tope_paso_usd IS NOT NULL;
