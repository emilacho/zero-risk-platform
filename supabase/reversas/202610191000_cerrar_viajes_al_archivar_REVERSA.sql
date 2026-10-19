-- REVERSA de «archivar un cliente cierra sus viajes» · CC#1 · 2026-10-19.
-- NO va en supabase/migrations/. Quita el trigger y la función; los viajes que la regla ya cerró NO se reabren (eso es dato, no regla).
BEGIN;
DROP TRIGGER IF EXISTS trg_cerrar_viajes_al_archivar ON public.clients;
DROP FUNCTION IF EXISTS public.cerrar_viajes_al_archivar_cliente();
COMMIT;
