-- Migration · client_champions · 2026-05-20 Sprint 3 D4
-- CC#2 multi-tenant scope · tenant_id + RLS canon (see 202605200100_*.sql preamble)

BEGIN;

CREATE TABLE IF NOT EXISTS client_champions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'zero-risk-default',
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

CREATE INDEX IF NOT EXISTS idx_client_champions_tenant ON client_champions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_champions_client ON client_champions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_champions_email ON client_champions(champion_email) WHERE champion_email IS NOT NULL;

ALTER TABLE client_champions ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_champions_service_role_all ON client_champions
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY client_champions_tenant_scoped_select ON client_champions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY client_champions_tenant_scoped_insert ON client_champions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY client_champions_tenant_scoped_update ON client_champions
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'))
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

COMMENT ON TABLE client_champions IS 'Sprint 3 D4 · CC#2 · client-side stakeholders / internal champions · relationship + influence tracking';

COMMIT;
