-- EL RECONCILIADOR DE DESPACHOS HUÉRFANOS · la tabla de hallazgos · CC#1 · 2026-09-30 · GO de Emilio.
-- 🔴 NO APLICADA al escribirse: se aplica en la PUBLICACIÓN, con aviso previo. Es ADITIVA (tabla nueva) e inerte: solo el reloj del
-- reconciliador la escribe; ningún camino crítico (run-sdk · corredor · flujos) la lee ni la escribe.
--
-- Una fila por despacho con problema (o con un dato que conviene ver). `dispatch_key` es la clave (si el despacho no la trae se usa
-- «id:<uuid>»). El reloj la ACTUALIZA en cada pasada (ultima_vez) sin pisar `primera_vez` ni `avisado_el`, así un mismo hallazgo se
-- avisa UNA sola vez; cuando el despacho deja de ser un problema se marca `resuelta_el`.
-- Lección de client_web_pages (06-sep): una tabla nueva SIN GRANT + RLS no la ve PostgREST → se dan los dos aquí.
CREATE TABLE IF NOT EXISTS public.agent_dispatch_reconciliations (
  dispatch_key  text PRIMARY KEY,
  agente        text NOT NULL,
  ejecucion     text,
  cliente       text,
  clasificacion text NOT NULL CHECK (clasificacion IN (
    'termino_y_no_entrego', 'nunca_arranco', 'sin_senales_de_vida', 'error_sin_entrega',
    'entregado_ledger_abierto', 'error_entregado', 'error_callback_409'
  )),
  severidad     text NOT NULL CHECK (severidad IN ('alta', 'info')),
  que           text NOT NULL,
  evidencia     jsonb NOT NULL DEFAULT '{}'::jsonb,
  primera_vez   timestamptz NOT NULL DEFAULT now(),
  ultima_vez    timestamptz NOT NULL DEFAULT now(),
  avisado_el    timestamptz,
  resuelta_el   timestamptz
);
CREATE INDEX IF NOT EXISTS adr_abiertas_idx ON public.agent_dispatch_reconciliations (severidad, avisado_el) WHERE resuelta_el IS NULL;
ALTER TABLE public.agent_dispatch_reconciliations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_dispatch_reconciliations TO service_role;
CREATE POLICY adr_service ON public.agent_dispatch_reconciliations FOR ALL TO service_role USING (true) WITH CHECK (true);
