-- Migration · contact_relationships · 2026-05-20 Sprint 3 D4
-- CC#2 multi-tenant scope · tenant_id + RLS canon (see 202605200100_*.sql preamble)

BEGIN;

CREATE TABLE IF NOT EXISTS contact_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'zero-risk-default',
  from_contact_id UUID NOT NULL,
  from_contact_type TEXT NOT NULL DEFAULT 'lead',
  to_contact_id UUID NOT NULL,
  to_contact_type TEXT NOT NULL DEFAULT 'lead',
  relationship_type TEXT NOT NULL
    CHECK (relationship_type IN (
      'reports_to','colleague','referred_by','referred','partner_of',
      'vendor_of','customer_of','same_company','spouse','family','other'
    )),
  strength TEXT NOT NULL DEFAULT 'medium'
    CHECK (strength IN ('weak','medium','strong')),
  notes TEXT,
  established_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_relationship CHECK (from_contact_id != to_contact_id),
  UNIQUE (tenant_id, from_contact_id, to_contact_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_contact_rel_tenant ON contact_relationships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_rel_from ON contact_relationships(from_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_rel_to ON contact_relationships(to_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_rel_type ON contact_relationships(relationship_type);

ALTER TABLE contact_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_rel_service_role_all ON contact_relationships
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY contact_rel_tenant_scoped_select ON contact_relationships
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY contact_rel_tenant_scoped_insert ON contact_relationships
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

COMMENT ON TABLE contact_relationships IS 'Sprint 3 D4 · CC#2 · directional graph of contact relationships · supports referral chains + org hierarchy';

COMMIT;
