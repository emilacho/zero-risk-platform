-- REVERSA de 202610281600_agents_creative_director_mesa · borra SOLO la fila nueva, y solo si sigue inactiva.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agents WHERE name = 'creative-director-mesa' AND (is_active OR status <> 'inactive')) THEN
    RAISE EXCEPTION 'creative-director-mesa está activa: desactívala antes de revertir';
  END IF;
END $$;
DELETE FROM public.agents WHERE name = 'creative-director-mesa' AND NOT is_active;
COMMIT;
NOTIFY pgrst, 'reload schema';
