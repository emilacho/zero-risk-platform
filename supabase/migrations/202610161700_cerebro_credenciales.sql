-- LLAVES POR CLIENTE, CIFRADAS · CC-CEREBRO · 2026-10-16 (firma de Emilio: P1 de la auditoría agnóstica).
-- Tabla NUEVA y aditiva: una fila por cliente, proveedor y campo. El valor va CIFRADO por el servidor (AES-256-GCM, clave maestra solo en el servidor): la base nunca guarda una llave en claro.
-- Solo el servidor (service_role) la toca; anon, authenticated y PUBLIC no tienen ningún permiso. Una llave cambiada no se borra: queda retirada con su fecha.
-- 🔴 Tabla nueva = GRANT + RLS en la misma migración. REVERSA: supabase/reversas/202610161700_cerebro_credenciales_REVERSA.sql (se niega si ya hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.cerebro_credenciales (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  proveedor             text NOT NULL CHECK (proveedor IN ('loyverse','meta')),
  campo                 text NOT NULL,
  valor_cifrado         text NOT NULL,
  huella                text NOT NULL,
  workflow_id           text,
  workflow_execution_id text,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  retirada_en           timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cerebro_credenciales_una_vigente ON public.cerebro_credenciales (client_id, proveedor, campo) WHERE retirada_en IS NULL;
ALTER TABLE public.cerebro_credenciales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cerebro_credenciales FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS cerebro_credenciales_service ON public.cerebro_credenciales;
CREATE POLICY cerebro_credenciales_service ON public.cerebro_credenciales FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.cerebro_credenciales TO service_role;
COMMENT ON TABLE public.cerebro_credenciales IS 'Llaves por cliente (Loyverse, Meta) cifradas por el servidor. Nunca en claro. Una cambiada queda retirada, no borrada.';
COMMIT;
NOTIFY pgrst, 'reload schema';
