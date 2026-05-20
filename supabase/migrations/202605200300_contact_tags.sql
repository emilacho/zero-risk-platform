-- Migration · contact_tags · 2026-05-20 Sprint 3 D4
-- CC#2 multi-tenant scope · tenant_id + RLS canon (see 202605200100_*.sql preamble)

BEGIN;

CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'zero-risk-default',
  contact_id UUID NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'lead'
    CHECK (contact_type IN ('lead','client','champion','partner','vendor','other')),
  tag TEXT NOT NULL,
  tag_category TEXT,
  source TEXT,
  created_by_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contact_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_tenant ON contact_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag);
CREATE INDEX IF NOT EXISTS idx_contact_tags_category ON contact_tags(tag_category) WHERE tag_category IS NOT NULL;

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_tags_service_role_all ON contact_tags
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY contact_tags_tenant_scoped_select ON contact_tags
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY contact_tags_tenant_scoped_insert ON contact_tags
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

COMMENT ON TABLE contact_tags IS 'Sprint 3 D4 · CC#2 · CRM-style contact tagging · cross-table contact_id (NOT FK · contact_type discriminator)';

COMMIT;
