-- ═══════════════════════════════════════════════════════════════════════════
-- D1 · registrar el costo de las huellas · el vigía era ciego a este camino
-- Firmado por Emilio · 2026-08-23 · destino: TABLA PROPIA
--
-- EL AGUJERO, MEDIDO (CC#3 2026-08-22)
--   · `ingest-source` calcula `cost_usd` y lo devuelve EN LA RESPUESTA · nunca lo guarda.
--   · Los 6 caminos de huellas (ingest-source · reindex-stale · reembed-source-row ·
--     persist-chunks · voc-ingest · embed) tienen CERO referencias a una tabla de costos.
--   · Gasto histórico en huellas: $0,000909 sobre 847 fichas / 153.182 caracteres.
--     El vigía de $8/día ve $0,00 de eso.
--
-- POR QUÉ TABLA PROPIA Y NO UNA FILA EN `agent_invocations`
--   Meter la fila ahí saldría más barato hoy (el vigía la vería sin tocarlo), pero
--   ROMPE el canon "agentes sólo vía workflows · workflow_id IS NULL debe ser 0 filas"
--   — una regla que la agencia se dio DESPUÉS de pagar $19 por no tener rastro.
--   No se rompe de costado: se paga la consulta extra en el vigía.
--
-- PROPORCIÓN · esto es rastro, no freno. El modelo de huellas es ~3.000× más barato
-- por unidad que los empleados: para llegar al techo de un día harían falta ~1.348
-- millones de caracteres. El riesgo real no es el precio por llamada: es la
-- repetición sin tope (el incidente de $19 fue un bucle, no una llamada cara).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.brain_embed_costs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES public.clients(id),
  source_table     TEXT NOT NULL,
  source_id        TEXT,
  -- Qué se embebió
  sections_count   INTEGER NOT NULL DEFAULT 0,
  chars_count      INTEGER NOT NULL DEFAULT 0,
  tokens_count     INTEGER NOT NULL DEFAULT 0,
  -- Cuánto costó · misma unidad y precisión que agent_invocations.cost_usd
  cost_usd         NUMERIC(12, 8) NOT NULL DEFAULT 0,
  embedding_model  TEXT,
  -- Rastro · de dónde vino la escritura
  ingress_route    TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.brain_embed_costs IS
  'D1 · costo de generar huellas del CEREBRO. Existe porque el camino de embebidos '
  'gasta y NO registraba nada: el vigía de $8/día era ciego a él. Tabla propia y no '
  'una fila en agent_invocations para no romper el canon workflow_id (un embebido no '
  'tiene workflow). Es RASTRO, no freno.';

CREATE INDEX IF NOT EXISTS brain_embed_costs_client_created_idx
  ON public.brain_embed_costs (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brain_embed_costs_created_idx
  ON public.brain_embed_costs (created_at DESC);

-- Canon de permisos · patrón de `202606040003_g6_hardening_revoke_rls.sql`.
-- La lección del 2026-08-21: por omisión Postgres concede a PUBLIC, y de las 31
-- funciones expuestas sólo 2 estaban fuera del alcance de la llave pública.
-- Una tabla de costos NO se expone a internet.
ALTER TABLE public.brain_embed_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brain_embed_costs FROM PUBLIC;
REVOKE ALL ON public.brain_embed_costs FROM anon;
REVOKE ALL ON public.brain_embed_costs FROM authenticated;
GRANT SELECT, INSERT ON public.brain_embed_costs TO service_role;

-- Reversión: DROP TABLE IF EXISTS public.brain_embed_costs;
