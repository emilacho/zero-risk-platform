-- ============================================================================
-- Migration: 202604280003_persist_resume_columns
-- Purpose: Extiende `client_journey_state` con las columnas que requiere
--          el Persist & Resume Protocol (Sprint #3 Fase 1 · CP3 Wave 10).
--          Agrega tabla `journey_events` para audit trail de TTL cron.
-- Author: CC#1 · Wave 10 · sprint-3-fase-1-ready branch
-- Idempotent: yes (ALTER ... ADD COLUMN IF NOT EXISTS · CREATE TABLE IF NOT EXISTS)
-- Depends on: 202604280001_client_journey_state (debe aplicarse antes)
-- Rollback: ver al final
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Extend client_journey_state · columnas persist+resume
-- ────────────────────────────────────────────────────────────────────────────

-- Token one-use para resume links · UUID + HMAC · NULL después de consumirse
ALTER TABLE client_journey_state
  ADD COLUMN IF NOT EXISTS resume_token TEXT;

-- URL completa para resume (auditing + dispatch a notificación)
ALTER TABLE client_journey_state
  ADD COLUMN IF NOT EXISTS resume_url TEXT;

-- Timestamp de expiración · NULL si no es paused_hitl
ALTER TABLE client_journey_state
  ADD COLUMN IF NOT EXISTS ttl_expires_at TIMESTAMPTZ;

-- Payload serializado para restaurar el journey al reanudar · JSONB independiente
-- de `metadata` (que es para context acumulado · audit trail).
ALTER TABLE client_journey_state
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;

-- Timestamp de abandono explícito · cron TTL set este al marcar abandoned.
-- (Se mantiene además del completed_at del schema original que se setea via
-- trigger; son redundantes pero `abandoned_at` es semánticamente claro.)
ALTER TABLE client_journey_state
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Indexes · query patterns persist+resume
-- ────────────────────────────────────────────────────────────────────────────

-- Cron TTL enforcement · scan O(log n) de paused_hitl con TTL expired.
CREATE INDEX IF NOT EXISTS idx_cjs_ttl_enforcement
  ON client_journey_state (ttl_expires_at)
  WHERE status = 'paused_hitl' AND ttl_expires_at IS NOT NULL;

-- Lookup por resume_token (resume webhook callback)
-- UNIQUE para prevenir colisión accidental (token reuse mid-flight).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cjs_resume_token
  ON client_journey_state (resume_token)
  WHERE resume_token IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Tabla journey_events · audit trail per persist+resume protocol
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journey_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID NOT NULL REFERENCES client_journey_state(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  -- Ejs: 'persisted' · 'resumed' · 'token_invalidated' · 'journey_abandoned_ttl'
  -- · 'persist_failed' · 'resume_failed' · 'payload_corrupted'
  actor           TEXT NOT NULL DEFAULT 'system',
  -- 'system:ttl-enforcement' · 'system:dispatch' · 'human:emilio' · 'webhook:hitl-approval' · etc.
  details         JSONB DEFAULT '{}'::jsonb,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_events_journey
  ON journey_events (journey_id, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_journey_events_type
  ON journey_events (event_type, event_timestamp DESC);

ALTER TABLE journey_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_journey_events" ON journey_events;
CREATE POLICY "service_role_all_journey_events" ON journey_events
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE journey_events IS
  'Audit trail per Persist & Resume Protocol · cada persist/resume/abandono inserta un event row. Consumido por cron TTL enforcement + Sentry breadcrumbs.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Documentación inline
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN client_journey_state.resume_token IS
  'Token one-use UUID + HMAC para reanudación · NULL después de consumir (idempotency).';
COMMENT ON COLUMN client_journey_state.resume_url IS
  'URL completa del resume callback · ej. https://api/api/journey/{id}/resume?token={token}';
COMMENT ON COLUMN client_journey_state.ttl_expires_at IS
  'Cuándo expira el persist · cron lo marca abandoned si NOW() > ttl_expires_at AND status=paused_hitl.';
COMMENT ON COLUMN client_journey_state.payload IS
  'JSONB con estado serializado para restaurar el journey al resume. Independiente de metadata.';
COMMENT ON COLUMN client_journey_state.abandoned_at IS
  'Timestamp explícito de abandono por TTL · redundante con completed_at pero semánticamente claro.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Smoke test embebido (revertible)
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  test_id UUID;
BEGIN
  -- Insert test row con persist columns set
  INSERT INTO client_journey_state (
    journey, trigger_type, trigger_source, status,
    resume_token, resume_url, ttl_expires_at, payload
  )
  VALUES (
    'PRODUCE', 'manual', 'smoke_test_persist', 'paused_hitl',
    'test-token-abc.def123', 'https://example.com/resume?token=test-token-abc.def123',
    NOW() + INTERVAL '1 day', '{"phase": "phase_5_qa_hitl", "draft": "..."}'::jsonb
  )
  RETURNING id INTO test_id;

  -- Insert audit event
  INSERT INTO journey_events (journey_id, event_type, actor, details)
  VALUES (test_id, 'persisted', 'system:smoke-test', jsonb_build_object('ttl_days', 1));

  -- ASSERT columnas existen y datos persisten
  PERFORM 1 FROM client_journey_state
  WHERE id = test_id
    AND resume_token = 'test-token-abc.def123'
    AND ttl_expires_at IS NOT NULL
    AND payload->>'phase' = 'phase_5_qa_hitl';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Smoke test failed: persist columns not set or readable';
  END IF;

  -- ASSERT audit event linked
  PERFORM 1 FROM journey_events WHERE journey_id = test_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Smoke test failed: journey_events FK linkage broken';
  END IF;

  -- DELETE (cascade limpia journey_events)
  DELETE FROM client_journey_state WHERE id = test_id;

  RAISE NOTICE 'Smoke test passed · persist_resume migration OK';
END $$;

-- ============================================================================
-- ROLLBACK (manual · NO ejecutar al apply)
-- ============================================================================
-- DROP INDEX IF EXISTS idx_cjs_resume_token;
-- DROP INDEX IF EXISTS idx_cjs_ttl_enforcement;
-- DROP INDEX IF EXISTS idx_journey_events_type;
-- DROP INDEX IF EXISTS idx_journey_events_journey;
-- DROP TABLE IF EXISTS journey_events CASCADE;
-- ALTER TABLE client_journey_state DROP COLUMN IF EXISTS abandoned_at;
-- ALTER TABLE client_journey_state DROP COLUMN IF EXISTS payload;
-- ALTER TABLE client_journey_state DROP COLUMN IF EXISTS ttl_expires_at;
-- ALTER TABLE client_journey_state DROP COLUMN IF EXISTS resume_url;
-- ALTER TABLE client_journey_state DROP COLUMN IF EXISTS resume_token;
