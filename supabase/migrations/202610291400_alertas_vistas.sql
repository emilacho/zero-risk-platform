-- «Ya lo vi» de la pantalla Alertas del dashboard · CC#2 · 2026-10-29 · ADENDA 4 de GO-LENOVO-construir-dashboard-y-pieza-mesa.
-- Tabla NUEVA y aparte: no toca ninguna fila existente. Una alarma marcada «vista» vuelve a aparecer sola si ocurre de nuevo (ultima_en > visto_en).
-- Una tabla nueva en Supabase necesita permisos: sin GRANT + RLS, PostgREST no la ve. Solo service_role (el dashboard lee y escribe desde el servidor, tras exigir sesión de administrador).
BEGIN;
CREATE TABLE IF NOT EXISTS public.alertas_vistas (
  clave     text PRIMARY KEY,
  visto_en  timestamptz NOT NULL DEFAULT now(),
  visto_por text
);
ALTER TABLE public.alertas_vistas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alertas_vistas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.alertas_vistas TO service_role;
DROP POLICY IF EXISTS alertas_vistas_service_role ON public.alertas_vistas;
CREATE POLICY alertas_vistas_service_role ON public.alertas_vistas FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMIT;
