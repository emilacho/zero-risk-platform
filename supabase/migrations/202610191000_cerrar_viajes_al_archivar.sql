-- Archivar un cliente cierra sus viajes abiertos (arreglo 2 de la cadena · CC#1 · 2026-10-19).
-- Antes el viaje ONBOARD de una ficha archivada seguía `active` (173 h el 19-oct) porque nadie lo cerraba: lo hacía una mano, no una regla.
-- La regla: cuando un cliente pasa a archivado (`archived_at` deja de ser nulo) o a `churned`, sus viajes en initiated/active/paused_hitl pasan a `abandoned`
-- (el trigger existente `trg_cjs_completed_at` pone `completed_at`, que la regla cjs_completed_has_timestamp exige). No toca viajes ya cerrados ni de otros clientes.
-- Idempotente: se puede correr más de una vez. La reversa vive en supabase/reversas/ (no aquí).
CREATE OR REPLACE FUNCTION public.cerrar_viajes_al_archivar_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL)
     OR (NEW.status = 'churned' AND OLD.status IS DISTINCT FROM 'churned') THEN
    UPDATE public.client_journey_state
       SET status = 'abandoned',
           outcome = 'cliente_archivado',
           outcome_data = COALESCE(outcome_data, '{}'::jsonb)
             || jsonb_build_object('nota', 'cerrado por la regla al archivar el cliente', 'cuando', clock_timestamp())
     WHERE client_id = NEW.id
       AND status IN ('initiated', 'active', 'paused_hitl');
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_cerrar_viajes_al_archivar ON public.clients;
CREATE TRIGGER trg_cerrar_viajes_al_archivar
  AFTER UPDATE OF archived_at, status ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.cerrar_viajes_al_archivar_cliente();
