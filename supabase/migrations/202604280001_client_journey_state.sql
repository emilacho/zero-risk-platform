-- ============================================================================
-- Migration: 202604280001_client_journey_state
-- Purpose: Schema para Master Journey Orchestrator (Sprint #3 Fase 1 MVP)
-- Author: Cowork autónomo · S34 turno 5h
-- Idempotent: yes · safe to re-run
-- Rollback: drop table client_journey_state cascade · drop type journey_type · drop type journey_status
-- ============================================================================

-- ENUM types · journey y status canónicos
DO $$ BEGIN
  CREATE TYPE journey_type AS ENUM ('ACQUIRE', 'ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE journey_status AS ENUM ('initiated', 'active', 'paused_hitl', 'completed', 'failed', 'abandoned');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'cron', 'callback');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Tabla principal: client_journey_state
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_journey_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK al cliente · null permitido SOLO durante ACQUIRE (cliente aún no existe)
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- Journey type · enum validado
  journey         journey_type NOT NULL,

  -- Stage actual dentro del journey (free-form para flexibilidad por journey)
  current_stage   TEXT,

  -- Status del journey · enum validado
  status          journey_status NOT NULL DEFAULT 'initiated',

  -- Trigger source · trazabilidad
  trigger_type    trigger_type NOT NULL DEFAULT 'manual',
  trigger_source  TEXT, -- ej. 'mission_control' · 'lead_form_v2' · 'cron_weekly_report'

  -- Payload original del trigger · auditing
  trigger_payload JSONB,

  -- Metadata acumulado durante el journey · agentes invocados, outputs, decisions
  metadata        JSONB DEFAULT '{}'::jsonb,

  -- HITL tracking
  hitl_pending_count INT DEFAULT 0,
  hitl_resolved_count INT DEFAULT 0,
  last_hitl_at    TIMESTAMPTZ,

  -- Sub-journey y parent (para trigger encadenado · ej. ACQUIRE → ONBOARD)
  parent_journey_id UUID REFERENCES client_journey_state(id) ON DELETE SET NULL,

  -- Resultado final · null hasta completed/failed
  outcome         TEXT, -- 'closed_won' · 'closed_lost' · 'completed_normal' · 'completed_with_iteration' · 'failed_at_stage_X'
  outcome_data    JSONB,

  -- Errores acumulados · debugging
  error_count     INT DEFAULT 0,
  last_error      TEXT,
  last_error_at   TIMESTAMPTZ,

  -- Timestamps
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,

  -- Constraints adicionales
  CONSTRAINT cjs_acquire_can_have_null_client CHECK (
    (journey = 'ACQUIRE') OR (journey != 'ACQUIRE' AND client_id IS NOT NULL)
  ),
  CONSTRAINT cjs_completed_has_timestamp CHECK (
    (status NOT IN ('completed', 'failed', 'abandoned')) OR (completed_at IS NOT NULL)
  )
);

-- ============================================================================
-- Indexes · query patterns esperados
-- ============================================================================

-- Buscar journey activo por cliente (más común)
CREATE INDEX IF NOT EXISTS idx_cjs_client_active
  ON client_journey_state (client_id, status)
  WHERE status IN ('initiated', 'active', 'paused_hitl');

-- Buscar journeys por type para reporting
CREATE INDEX IF NOT EXISTS idx_cjs_journey_status
  ON client_journey_state (journey, status);

-- Buscar HITL pending para dashboard MC
CREATE INDEX IF NOT EXISTS idx_cjs_hitl_pending
  ON client_journey_state (hitl_pending_count)
  WHERE hitl_pending_count > 0;

-- Sort cronológico
CREATE INDEX IF NOT EXISTS idx_cjs_started_at
  ON client_journey_state (started_at DESC);

-- Parent-child traversal (cadena ACQUIRE→ONBOARD→PRODUCE)
CREATE INDEX IF NOT EXISTS idx_cjs_parent
  ON client_journey_state (parent_journey_id)
  WHERE parent_journey_id IS NOT NULL;

-- ============================================================================
-- Trigger: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_client_journey_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cjs_updated_at ON client_journey_state;
CREATE TRIGGER trg_cjs_updated_at
  BEFORE UPDATE ON client_journey_state
  FOR EACH ROW EXECUTE FUNCTION update_client_journey_state_timestamp();

-- ============================================================================
-- Trigger: auto-set completed_at cuando status pasa a terminal
-- ============================================================================

CREATE OR REPLACE FUNCTION set_completed_at_on_terminal_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'abandoned')
     AND OLD.status NOT IN ('completed', 'failed', 'abandoned')
  THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cjs_completed_at ON client_journey_state;
CREATE TRIGGER trg_cjs_completed_at
  BEFORE UPDATE ON client_journey_state
  FOR EACH ROW EXECUTE FUNCTION set_completed_at_on_terminal_status();

-- ============================================================================
-- RLS · Row Level Security
-- ============================================================================

ALTER TABLE client_journey_state ENABLE ROW LEVEL SECURITY;

-- Service role tiene acceso completo (n8n + Vercel API)
DROP POLICY IF EXISTS "service_role_all_access" ON client_journey_state;
CREATE POLICY "service_role_all_access" ON client_journey_state
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users (futuro · si el dashboard expone vista) · solo lectura por client_id
DROP POLICY IF EXISTS "authenticated_read_own_client" ON client_journey_state;
CREATE POLICY "authenticated_read_own_client" ON client_journey_state
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM clients WHERE owner_user_id = auth.uid()));

-- Anon · sin acceso (la tabla NUNCA debe exponerse a anon)
-- (no policy = denied by default cuando RLS enabled)

-- ============================================================================
-- View: active_journeys (para Mission Control dashboard)
-- ============================================================================

CREATE OR REPLACE VIEW active_journeys AS
SELECT
  cjs.id,
  cjs.client_id,
  c.name AS client_name,
  cjs.journey,
  cjs.current_stage,
  cjs.status,
  cjs.hitl_pending_count,
  cjs.started_at,
  cjs.updated_at,
  EXTRACT(EPOCH FROM (NOW() - cjs.started_at))/3600 AS hours_active,
  cjs.metadata
FROM client_journey_state cjs
LEFT JOIN clients c ON c.id = cjs.client_id
WHERE cjs.status IN ('initiated', 'active', 'paused_hitl')
ORDER BY cjs.started_at DESC;

GRANT SELECT ON active_journeys TO service_role;
GRANT SELECT ON active_journeys TO authenticated;

-- ============================================================================
-- Comentarios para documentación PostgreSQL (visible en pgAdmin/Supabase Studio)
-- ============================================================================

COMMENT ON TABLE client_journey_state IS
  'State machine per cliente para Master Journey Orchestrator. 1 row por journey activo o histórico. Ver docs/05-orquestacion/MASTER_WORKFLOW_DESIGN.md';

COMMENT ON COLUMN client_journey_state.parent_journey_id IS
  'Para journey encadenado · ACQUIRE.id → ONBOARD.parent_journey_id → PRODUCE.parent_journey_id (rastreabilidad)';

COMMENT ON COLUMN client_journey_state.metadata IS
  'JSONB con context acumulado: agentes invocados, outputs intermedios, decision tree path. NO almacena outputs grandes (esos van a client_historical_outputs).';

COMMENT ON COLUMN client_journey_state.outcome IS
  'Resultado final del journey. ACQUIRE: closed_won|closed_lost. ONBOARD: completed_normal|abandoned_at_intake. PRODUCE: completed_normal|completed_with_iteration|failed_at_stage_X. ALWAYS_ON: never terminal. REVIEW: renew|expand|churn.';

-- ============================================================================
-- Smoke test · INSERT + UPDATE + SELECT (revertible)
-- ============================================================================

DO $$
DECLARE
  test_id UUID;
BEGIN
  -- INSERT
  INSERT INTO client_journey_state (journey, trigger_type, trigger_source)
  VALUES ('ACQUIRE', 'webhook', 'smoke_test')
  RETURNING id INTO test_id;

  -- UPDATE status (debe disparar trigger updated_at)
  UPDATE client_journey_state
  SET status = 'completed', outcome = 'closed_lost'
  WHERE id = test_id;

  -- ASSERT updated_at != started_at (trigger funcionó)
  PERFORM 1 FROM client_journey_state
  WHERE id = test_id AND updated_at > started_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Smoke test failed: updated_at trigger did not fire';
  END IF;

  -- ASSERT completed_at set automáticamente
  PERFORM 1 FROM client_journey_state
  WHERE id = test_id AND completed_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Smoke test failed: completed_at trigger did not fire';
  END IF;

  -- DELETE (revertir test)
  DELETE FROM client_journey_state WHERE id = test_id;

  RAISE NOTICE 'Smoke test passed · client_journey_state migration OK';
END $$;

-- ============================================================================
-- FIN MIGRATION
-- ============================================================================
