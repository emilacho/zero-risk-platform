-- Migration · contact_tags · 2026-05-20 Sprint 3 D4
-- Single-tenant canon enforced 2026-05-20 per Emilio decision (CLAUDE.md Stack clave V4)
-- RLS · service_role bypass + admin-only (app_roles.role = 'admin')

BEGIN;

CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'lead'
    CHECK (contact_type IN ('lead','client','champion','partner','vendor','other')),
  tag TEXT NOT NULL,
  tag_category TEXT,
  source TEXT,
  created_by_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag);
CREATE INDEX IF NOT EXISTS idx_contact_tags_category ON contact_tags(tag_category) WHERE tag_category IS NOT NULL;

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_tags_service_role_all ON contact_tags
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY contact_tags_admin_full_access ON contact_tags
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE contact_tags IS 'Sprint 3 D4 · CC#2 · CRM-style contact tagging · cross-table contact_id (NOT FK · contact_type discriminator) · single-tenant canon';

COMMIT;
