-- Brain FASE C · tabla ingress_quarantine · pre-requisito del flip shadow→enforce
-- 2026-06-28 · CC#1 · branch/shadow · NO aplicar a prod sin §144 (R10 single-file)
-- ADR-012 §5.3 (quarantine workflow) + §6.2 (DDL) · ARQUITECTURA portero
--
-- ⚠️ §148 · el schema "mínimo" del dispatch NO alcanza · los consumers YA EXISTEN
-- y esperan más columnas ·
--   - src/app/api/ingress-quarantine/list/route.ts SELECT ·
--     id, source, ingress_route, payload_size_bytes, gate_decisions, severity,
--     status, hitl_decided_by, hitl_decided_at, hitl_reason, client_id,
--     workflow_id, created_at, expires_at
--   - src/app/api/ingress-quarantine/[id]/decide/route.ts UPDATE ·
--     status (filtra status='pending') + hitl_decided_by/at/reason
-- Construir solo el mínimo rompería ambas routes. Esta migración es el SUPERSET ·
-- mínimo del dispatch (source/trust_level/rejection_reason/payload/client_id/journey_id)
-- + columnas requeridas por los consumers.
--
-- Idempotente · CREATE IF NOT EXISTS + policy DROP/CREATE.

BEGIN;

CREATE TABLE IF NOT EXISTS ingress_quarantine (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- mínimo del dispatch
  source             text NOT NULL,
  trust_level        text NOT NULL,
  rejection_reason   text NOT NULL,
  payload            jsonb NOT NULL,
  client_id          uuid REFERENCES clients(id) ON DELETE SET NULL,
  journey_id         uuid,

  -- requeridas por los consumers existentes (list + decide · ADR-012 §6.2)
  ingress_route      text,
  payload_size_bytes int,
  gate_decisions     jsonb,                         -- array {capa, verdict, severity, latency_ms}
  severity           text CHECK (severity IS NULL OR severity IN ('LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN')),
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected')),
  hitl_decided_by    text,
  hitl_decided_at    timestamptz,
  hitl_reason        text,
  workflow_id        text,
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

-- Índices · dispatch (client_id + created_at) + consumers filtran por status.
CREATE INDEX IF NOT EXISTS idx_ingress_quarantine_client    ON ingress_quarantine (client_id);
CREATE INDEX IF NOT EXISTS idx_ingress_quarantine_created    ON ingress_quarantine (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingress_quarantine_status     ON ingress_quarantine (status, created_at DESC);

-- RLS · solo service_role lee/escribe (la app usa service_role · bypassea RLS) ·
-- sin policy para authenticated/anon → denegados por defecto.
ALTER TABLE ingress_quarantine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quarantine_service_role_all ON ingress_quarantine;
CREATE POLICY quarantine_service_role_all ON ingress_quarantine
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE ingress_quarantine IS
  'Brain FASE C · ADR-012 §5.3 · payloads que bloquearían en enforce · revisión HITL · solo service_role';

COMMIT;
