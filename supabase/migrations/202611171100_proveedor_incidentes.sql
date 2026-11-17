-- INCIDENTES DE PROVEEDORES · CC2 · 2026-11-17 (GO de Lenovo «prevención llaves + Apify», Emilio «dale» 07:00 · decisión (b) de Lenovo: tabla propia, sin depender de `cerebro_alertas`).
-- 🔴 NO APLICADA al escribirse: se aplica con la certificación de CC6, ANTES de publicar el código que la usa. SOLO ADITIVA: una tabla nueva, nada existente cambia; nada `cerebro_*`.
-- Un incidente de un proveedor (llave rota, tope, caída, tope del mes) = UNA fila por `clave`: el primer aviso abre un mensaje en #alertas y guarda su hilo; los cambios responden en él y el «volvió» lo cierra.
-- `clave` es la llave primaria: dos vigías a la vez no pueden abrir dos filas (el segundo INSERT choca con 23505 y no publica).
-- Tabla nueva = GRANT + RLS en la misma migración (sin permisos PostgREST no la ve). Solo `service_role`: nada para `anon` ni `authenticated`.
-- REVERSA: supabase/reversas/202611171100_proveedor_incidentes_REVERSA.sql (se niega si hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.proveedor_incidentes (
  clave          text PRIMARY KEY,
  canal          text NOT NULL,
  thread_ts      text,
  titulo         text,
  ultimo_detalle text,
  repeticiones   integer NOT NULL DEFAULT 0,
  abierto_en     timestamptz NOT NULL DEFAULT now(),
  ultima_en      timestamptz NOT NULL DEFAULT now(),
  cerrado_en     timestamptz
);
ALTER TABLE public.proveedor_incidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proveedor_incidentes_service ON public.proveedor_incidentes;
CREATE POLICY proveedor_incidentes_service ON public.proveedor_incidentes FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.proveedor_incidentes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.proveedor_incidentes TO service_role;
COMMENT ON TABLE public.proveedor_incidentes IS 'Incidentes de proveedores (Apify, la base…) del vigía de lecturas: una fila por incidente (clave); el primer aviso abre el hilo en #alertas y los cambios y el «volvió» responden en él.';
COMMIT;
NOTIFY pgrst, 'reload schema';
