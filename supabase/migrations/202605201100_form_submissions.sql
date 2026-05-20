-- Migration · form_submissions · 2026-05-20 Sprint 4 · Forms infrastructure
-- Single-tenant canon (per PR #56 pattern) · admin-only RLS
-- Tally webhook deposits raw payload here · downstream pipeline reads + creates contacts

BEGIN;

CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE SET NULL,
  contact_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'tally'
    CHECK (source IN ('tally','direct','manual','import','other')),
  source_event_id TEXT,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_subs_form ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_subs_contact ON form_submissions(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_subs_processed ON form_submissions(processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_form_subs_created ON form_submissions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_subs_event ON form_submissions(source, source_event_id) WHERE source_event_id IS NOT NULL;

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY form_submissions_service_role_all ON form_submissions
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY form_submissions_admin_full_access ON form_submissions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE form_submissions IS 'Sprint 4 · CC#2 · Tally webhook submissions log · raw payload preserved · signature_verified flag · single-tenant canon';

COMMIT;
