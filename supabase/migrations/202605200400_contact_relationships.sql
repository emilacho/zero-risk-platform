-- Migration · contact_relationships · 2026-05-20 Sprint 3 D4
-- Single-tenant canon enforced 2026-05-20 per Emilio decision (CLAUDE.md Stack clave V4)
-- RLS · service_role bypass + admin-only (app_roles.role = 'admin')

BEGIN;

CREATE TABLE IF NOT EXISTS contact_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  UNIQUE (from_contact_id, to_contact_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_contact_rel_from ON contact_relationships(from_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_rel_to ON contact_relationships(to_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_rel_type ON contact_relationships(relationship_type);

ALTER TABLE contact_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_rel_service_role_all ON contact_relationships
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY contact_rel_admin_full_access ON contact_relationships
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE contact_relationships IS 'Sprint 3 D4 · CC#2 · directional graph of contact relationships · supports referral chains + org hierarchy · single-tenant canon';

COMMIT;
