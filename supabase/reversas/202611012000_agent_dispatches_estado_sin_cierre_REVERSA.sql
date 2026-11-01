-- REVERSA de 202611012000 · devuelve la lista de estados. Se NIEGA si ya hay filas «sin_cierre»: esas filas son un cierre con su motivo y se deciden a mano, no se pisan.
BEGIN;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.agent_dispatches WHERE status = 'sin_cierre';
  IF n > 0 THEN RAISE EXCEPTION 'hay % despachos sin_cierre: la reversa no los pisa', n; END IF;
END $$;
ALTER TABLE public.agent_dispatches DROP CONSTRAINT IF EXISTS agent_dispatches_status_check;
ALTER TABLE public.agent_dispatches ADD CONSTRAINT agent_dispatches_status_check CHECK (status IN ('accepted', 'running', 'completed', 'error'));
COMMIT;
NOTIFY pgrst, 'reload schema';
