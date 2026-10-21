-- CONSULTA INSTANTÁNEA · AVISO DEL PEDIDO · ALERTAS POR INCIDENTE · CC-CEREBRO · 2026-10-21 (firma de Emilio «SI»).
-- 🔴 NO APLICADA al escribirse: se aplica con 0 corridas vivas ANTES de fusionar el PR (el código nuevo pide estas columnas y tablas). SOLO ADITIVA: ninguna fila existente cambia.
--  1 · `cerebro_consultas`: quién consultó el cerebro por la puerta de lectura instantánea (oficina, agente, qué, cuántas fichas, si no había dato). US$ 0.
--  2 · `cerebro_pedidos`: 3 columnas anulables para que el pedido AVISE a quien lo pidió (`avisar_a`, `ref_de_quien_pide`) y deje constancia (`aviso`).
--  3 · `cerebro_alertas`: un incidente de Slack = una fila (clave, hilo, repeticiones): el primer aviso es un mensaje en #alertas; las repeticiones, respuestas en su hilo.
-- Tablas nuevas = GRANT + RLS en la misma migración (sin permisos PostgREST no las ve). REVERSA: supabase/reversas/202610211800_consultas_avisos_y_alertas_por_incidente_REVERSA.sql (se niega si hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.cerebro_consultas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  oficina      text NOT NULL,
  agente       text NOT NULL,
  que          text,
  atributo     text,
  sede_clave   text,
  resultados   integer NOT NULL DEFAULT 0,
  sin_dato     boolean NOT NULL DEFAULT false,
  ms           integer,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cerebro_consultas_por_cliente ON public.cerebro_consultas (client_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS cerebro_consultas_por_oficina ON public.cerebro_consultas (oficina, creado_en DESC);
ALTER TABLE public.cerebro_consultas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cerebro_consultas_service ON public.cerebro_consultas;
CREATE POLICY cerebro_consultas_service ON public.cerebro_consultas FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON public.cerebro_consultas TO service_role;
COMMENT ON TABLE public.cerebro_consultas IS 'Quién consultó el cerebro por GET /api/brain/consultar (sin modelo, sin gasto): oficina, agente, qué buscó y cuántas fichas devolvió.';

ALTER TABLE public.cerebro_pedidos ADD COLUMN IF NOT EXISTS avisar_a text;
ALTER TABLE public.cerebro_pedidos ADD COLUMN IF NOT EXISTS ref_de_quien_pide text;
ALTER TABLE public.cerebro_pedidos ADD COLUMN IF NOT EXISTS aviso jsonb;
COMMENT ON COLUMN public.cerebro_pedidos.avisar_a IS 'URL del flujo de la oficina que pidió: al terminar el pedido el portero hace UN POST ahí (solo anfitriones permitidos).';
COMMENT ON COLUMN public.cerebro_pedidos.aviso IS 'Constancia del aviso: {estado: entregado|fallo, intentos: [...], ultimo_en}.';

CREATE TABLE IF NOT EXISTS public.cerebro_alertas (
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
ALTER TABLE public.cerebro_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cerebro_alertas_service ON public.cerebro_alertas;
CREATE POLICY cerebro_alertas_service ON public.cerebro_alertas FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.cerebro_alertas TO service_role;
COMMENT ON TABLE public.cerebro_alertas IS 'Incidentes de Slack del cerebro/portero: una fila por incidente (clave); el primer aviso abre el hilo en #alertas y las repeticiones responden en él.';
COMMIT;
NOTIFY pgrst, 'reload schema';
