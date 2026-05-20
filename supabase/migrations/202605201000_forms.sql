-- Migration · forms · 2026-05-20 Sprint 4 · Forms infrastructure
-- Single-tenant canon (per PR #56 pattern) · admin-only RLS
-- Catálogo de forms registrados · Tally webhook-backed

BEGIN;

CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  vertical TEXT,
  tally_form_id TEXT UNIQUE,
  description TEXT,
  schema_fields JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forms_active ON forms(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_forms_vertical ON forms(vertical) WHERE vertical IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forms_tally ON forms(tally_form_id) WHERE tally_form_id IS NOT NULL;

ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY forms_service_role_all ON forms
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY forms_admin_full_access ON forms
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE forms IS 'Sprint 4 · CC#2 · forms catalog · Tally-backed external · single-tenant canon · admin-only RLS';

COMMIT;
