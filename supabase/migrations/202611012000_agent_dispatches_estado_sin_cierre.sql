-- 01-nov · ENCARGO Lenovo firmado por Emilio · ciclo de vida de los incidentes · CC1
-- Un estado más en agent_dispatches: «sin_cierre» = el despacho nunca registró su final y ya no se cuenta como en curso. Solo amplía la lista: ninguna fila cambia.
-- Una vuelta tardía sigue pudiendo marcarlo completed o error.
BEGIN;
ALTER TABLE public.agent_dispatches DROP CONSTRAINT IF EXISTS agent_dispatches_status_check;
ALTER TABLE public.agent_dispatches ADD CONSTRAINT agent_dispatches_status_check CHECK (status IN ('accepted', 'running', 'completed', 'error', 'sin_cierre'));
COMMIT;
NOTIFY pgrst, 'reload schema';
