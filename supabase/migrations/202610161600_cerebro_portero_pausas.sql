-- PAUSAR SOLO AL CLIENTE CON PROBLEMA · CC-CEREBRO · 2026-10-16 (firma de Emilio: P2 de la auditoría agnóstica).
-- Tabla NUEVA y aditiva: cuando el vigilante halla un problema de UN cliente, lo PAUSA (el flujo sigue para los demás) en vez de apagar el flujo entero.
-- Una pausa abierta = `levantada_en` nulo. Se levanta por dato (POST /api/brain/alimentar/reanudar o una fila actualizada), no a mano en n8n.
-- La escribe y la lee solo el servidor (service_role). 🔴 Tabla nueva = GRANT + RLS en la misma migración.
-- REVERSA: supabase/reversas/202610161600_cerebro_portero_pausas_REVERSA.sql (se niega si ya hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.cerebro_portero_pausas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  motivo                text NOT NULL,
  problemas             jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow_id           text,
  workflow_execution_id text,
  desde                 timestamptz NOT NULL DEFAULT now(),
  levantada_en          timestamptz,
  levantada_por         text,
  motivo_de_levantarla  text
);
CREATE UNIQUE INDEX IF NOT EXISTS cerebro_portero_pausas_una_abierta ON public.cerebro_portero_pausas (client_id) WHERE levantada_en IS NULL;
CREATE INDEX IF NOT EXISTS cerebro_portero_pausas_recientes ON public.cerebro_portero_pausas (desde DESC);
ALTER TABLE public.cerebro_portero_pausas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cerebro_portero_pausas_service ON public.cerebro_portero_pausas;
CREATE POLICY cerebro_portero_pausas_service ON public.cerebro_portero_pausas FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.cerebro_portero_pausas TO service_role;
COMMENT ON TABLE public.cerebro_portero_pausas IS 'Clientes que el vigilante del portero pausó por un problema propio (el flujo sigue para los demás). Abierta = levantada_en nulo.';
COMMIT;
NOTIFY pgrst, 'reload schema';
