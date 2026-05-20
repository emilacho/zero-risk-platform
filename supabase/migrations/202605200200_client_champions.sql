-- Migration · client_champions · 2026-05-20 Sprint 3 D4
-- Single-tenant canon enforced 2026-05-20 per Emilio decision (CLAUDE.md Stack clave V4)
-- RLS · service_role bypass + admin-only (app_roles.role = 'admin')

BEGIN;

CREATE TABLE IF NOT EXISTS client_champions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  champion_name TEXT NOT NULL,
  champion_role TEXT,
  champion_email TEXT,
  champion_phone TEXT,
  relationship_strength TEXT NOT NULL DEFAULT 'medium'
    CHECK (relationship_strength IN ('weak','medium','strong','very_strong')),
  influence_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (influence_level IN ('low','medium','high','executive')),
  last_contact_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_champions_client ON client_champions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_champions_email ON client_champions(champion_email) WHERE champion_email IS NOT NULL;

ALTER TABLE client_champions ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_champions_service_role_all ON client_champions
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY client_champions_admin_full_access ON client_champions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE client_champions IS 'Sprint 3 D4 · CC#2 · client-side stakeholders · single-tenant canon · admin-only RLS';

COMMIT;
