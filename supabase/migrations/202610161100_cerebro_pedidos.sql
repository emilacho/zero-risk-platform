-- PEDIDOS LIBRES AL PORTERO («completar con huecos») · CC-CEREBRO · 2026-10-16 (firma de Emilio 16-oct: «no le pongas límite a lo que pueden pedir»).
-- Tabla NUEVA y aditiva: el rastro de cada pedido (quién, cliente, sede, huecos, para qué, estado, costo, fichas, lo que no se pudo llenar con su motivo).
-- La escribe y la lee solo el servidor (service_role) por /api/brain/alimentar/pedido. Detrás de PORTERO_PEDIDOS (apagado por omisión): sin el interruptor nadie escribe aquí.
-- 🔴 Tabla nueva = GRANT + RLS en la misma migración (sin permisos PostgREST no la ve).
-- REVERSA: supabase/reversas/202610161100_cerebro_pedidos_REVERSA.sql (se niega si ya hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.cerebro_pedidos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sede_clave            text,
  pedido_por_oficina    text NOT NULL,
  pedido_por_agente     text NOT NULL,
  agente_en_roster      boolean,
  para                  text NOT NULL,
  huecos                jsonb NOT NULL DEFAULT '[]'::jsonb,
  huella                text NOT NULL,
  estado                text NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido','en_proceso','resuelto','parcial','no_resuelto','en_cadena','fallo')),
  resultado             jsonb,
  costo_usd             numeric(10,6) NOT NULL DEFAULT 0,
  fichas                jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow_id           text,
  workflow_execution_id text,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  terminado_en          timestamptz
);
CREATE INDEX IF NOT EXISTS cerebro_pedidos_por_cliente ON public.cerebro_pedidos (client_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS cerebro_pedidos_por_oficina_dia ON public.cerebro_pedidos (pedido_por_oficina, creado_en DESC);
CREATE INDEX IF NOT EXISTS cerebro_pedidos_huella ON public.cerebro_pedidos (client_id, huella, creado_en DESC);
ALTER TABLE public.cerebro_pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cerebro_pedidos_service ON public.cerebro_pedidos;
CREATE POLICY cerebro_pedidos_service ON public.cerebro_pedidos FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.cerebro_pedidos TO service_role;
COMMENT ON TABLE public.cerebro_pedidos IS 'Pedidos libres de una oficina o su director al portero del cerebro: quién pidió, para qué, qué huecos, qué se resolvió y qué quedó sin resolver (con lo que se intentó). Solo el portero la escribe.';
COMMIT;
NOTIFY pgrst, 'reload schema';
