-- ============================================================================
-- Migration: 202604280002_incrementality_tests
-- Purpose: Schema mínimo para que /api/testing/active-incrementality-tests
--          y el workflow `Zero Risk — Incrementality Test Runner` (n8n
--          ID 9WN8ccqg1XPtTZ13) operen sin error. Cubre Journey C Phase 7
--          (OPTIMIZE) del Sprint #3 implementation pack.
-- Author: CC#1 · Wave 9.5 fix sprint · D36
-- Idempotent: yes · safe to re-run
-- Rollback: DROP TABLE IF EXISTS incrementality_tests CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS incrementality_tests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE CASCADE,
  test_type        TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  hypothesis       TEXT,
  metrics_baseline JSONB,
  metrics_current  JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- Index sobre el filtro principal del endpoint (status='active').
CREATE INDEX IF NOT EXISTS idx_incrementality_tests_status
  ON incrementality_tests (status)
  WHERE status = 'active';

-- Index para queries por cliente (usado por reporting + Journey E REVIEW).
CREATE INDEX IF NOT EXISTS idx_incrementality_tests_client
  ON incrementality_tests (client_id, status);

COMMENT ON TABLE incrementality_tests IS
  'Tests de incrementality para optimization-agent · Journey C Phase 7 (OPTIMIZE). Consumida por workflow Incrementality Test Runner (n8n) cada 15 min.';
