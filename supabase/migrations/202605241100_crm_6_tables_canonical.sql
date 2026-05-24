-- Sprint 8C combo · 6 CRM tables canonical (companies + deals + pipelines +
-- activities + crm_notes + tags).
--
-- Closes the gap surfaced in CC#2 A5 (Sprint 8 follow-ups) where Stack V4
-- row 5 claimed "7 CRM tables live" but ground truth was 1 of 7 (only
-- `leads` existed · `contacts` shipped that dispatch as MVP). This
-- migration ships the 6 remaining canonical CRM surfaces in a single
-- atomic apply.
--
-- Schema design canon (matches `contacts` from Sprint 8 A5) ·
--   - `client_id` FK → clients(id) ON DELETE CASCADE · per-cliente isolation
--   - `metadata` JSONB · open extension surface
--   - `created_at` + `updated_at` timestamps with auto-trigger
--   - RLS enabled · service_role only (CRM data NOT anon-readable)
--   - Hot-path BTREE indexes on client_id + key lookup columns
--   - Unique dedupe constraint where it semantically makes sense
--
-- Idempotent · CREATE TABLE IF NOT EXISTS · CREATE INDEX IF NOT EXISTS ·
-- DROP POLICY/TRIGGER IF EXISTS pattern. Safe re-run.

-- ============================================================
-- companies · external business entities (competitors · partners ·
-- vendors · prospects) per Zero Risk cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  industry text,
  employees_estimate integer,
  hq_location text,
  relationship text NOT NULL DEFAULT 'prospect'
    CHECK (relationship IN ('prospect', 'competitor', 'partner', 'vendor', 'customer', 'other')),
  source text NOT NULL DEFAULT 'manual',
  source_metadata jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.companies IS
  'Sprint 8C · external business entities per Zero Risk cliente · 1 row per (client_id, name). Sources · web_discovery, manual, csv_import, nexus_phase_7, competitive_intel.';
COMMENT ON COLUMN public.companies.relationship IS
  'prospect (default) | competitor | partner | vendor | customer | other';
CREATE UNIQUE INDEX IF NOT EXISTS companies_client_name_uniq ON public.companies (client_id, lower(name));
CREATE INDEX IF NOT EXISTS companies_client_id_idx ON public.companies (client_id);
CREATE INDEX IF NOT EXISTS companies_domain_idx ON public.companies (domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_relationship_idx ON public.companies (client_id, relationship);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_service_role_all ON public.companies;
CREATE POLICY companies_service_role_all ON public.companies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- deals · sales-pipeline opportunities · 1 row per deal
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'prospecting'
    CHECK (stage IN ('prospecting', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'on_hold')),
  value_usd numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  expected_close_date date,
  closed_at timestamp with time zone,
  source text NOT NULL DEFAULT 'manual',
  owner text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.deals IS
  'Sprint 8C · sales-pipeline deals per Zero Risk cliente. stage drives the funnel · closed_at populated when stage moves to won/lost.';
COMMENT ON COLUMN public.deals.stage IS
  'prospecting (default) | qualified | proposal | negotiation | won | lost | on_hold';
CREATE INDEX IF NOT EXISTS deals_client_id_idx ON public.deals (client_id);
CREATE INDEX IF NOT EXISTS deals_company_id_idx ON public.deals (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deals_contact_id_idx ON public.deals (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deals_stage_idx ON public.deals (client_id, stage);
CREATE INDEX IF NOT EXISTS deals_expected_close_idx ON public.deals (expected_close_date) WHERE expected_close_date IS NOT NULL;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deals_service_role_all ON public.deals;
CREATE POLICY deals_service_role_all ON public.deals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- pipelines · sales-pipeline definitions (stages config per cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  stages jsonb NOT NULL DEFAULT '["prospecting", "qualified", "proposal", "negotiation", "won", "lost"]'::jsonb,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pipelines IS
  'Sprint 8C · sales-pipeline configurations per Zero Risk cliente. is_default identifies the primary pipeline · stages JSONB lists ordered phase labels.';
CREATE UNIQUE INDEX IF NOT EXISTS pipelines_client_name_uniq ON public.pipelines (client_id, lower(name));
CREATE INDEX IF NOT EXISTS pipelines_client_id_idx ON public.pipelines (client_id);
CREATE INDEX IF NOT EXISTS pipelines_default_idx ON public.pipelines (client_id) WHERE is_default = true;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipelines_service_role_all ON public.pipelines;
CREATE POLICY pipelines_service_role_all ON public.pipelines FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- activities · time-series log per contact/company/deal
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subject_type text NOT NULL
    CHECK (subject_type IN ('contact', 'company', 'deal', 'cliente')),
  subject_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('call', 'email', 'meeting', 'note', 'task', 'agent_run', 'system_event', 'other')),
  summary text NOT NULL,
  body text,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  agent_run_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.activities IS
  'Sprint 8C · time-series activity log per CRM subject. Polymorphic via (subject_type, subject_id) · subject NOT enforced via FK (rows can reference soft-deleted parents). Sources · sales rep manual entry · NEXUS Phase 7 hooks · agent runs.';
COMMENT ON COLUMN public.activities.agent_run_id IS
  'Optional FK to agent_invocations.id when the activity was generated by an agent run.';
CREATE INDEX IF NOT EXISTS activities_client_id_idx ON public.activities (client_id);
CREATE INDEX IF NOT EXISTS activities_subject_idx ON public.activities (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS activities_occurred_at_idx ON public.activities (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activities_kind_idx ON public.activities (client_id, kind);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activities_service_role_all ON public.activities;
CREATE POLICY activities_service_role_all ON public.activities FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- crm_notes · freeform notes attached to anything
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  attached_type text NOT NULL
    CHECK (attached_type IN ('contact', 'company', 'deal', 'pipeline', 'activity', 'cliente')),
  attached_id uuid NOT NULL,
  body text NOT NULL,
  author text,
  pinned boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.crm_notes IS
  'Sprint 8C · freeform notes annotation surface. Polymorphic via (attached_type, attached_id). pinned=true surfaces notes in summary views.';
CREATE INDEX IF NOT EXISTS crm_notes_client_id_idx ON public.crm_notes (client_id);
CREATE INDEX IF NOT EXISTS crm_notes_attached_idx ON public.crm_notes (attached_type, attached_id);
CREATE INDEX IF NOT EXISTS crm_notes_pinned_idx ON public.crm_notes (client_id, pinned) WHERE pinned = true;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_notes_service_role_all ON public.crm_notes;
CREATE POLICY crm_notes_service_role_all ON public.crm_notes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- tags · standard CRM segmentation labels
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tags IS
  'Sprint 8C · canonical CRM tag definitions per Zero Risk cliente. Attached to contacts/companies/deals via separate `tag_assignments` table (Sprint 9+ scope if needed).';
CREATE UNIQUE INDEX IF NOT EXISTS tags_client_name_uniq ON public.tags (client_id, lower(name));
CREATE INDEX IF NOT EXISTS tags_client_id_idx ON public.tags (client_id);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tags_service_role_all ON public.tags;
CREATE POLICY tags_service_role_all ON public.tags FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Shared updated_at trigger function (reused across tables)
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_updated_at_trigger ON public.companies;
CREATE TRIGGER companies_updated_at_trigger BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS deals_updated_at_trigger ON public.deals;
CREATE TRIGGER deals_updated_at_trigger BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS pipelines_updated_at_trigger ON public.pipelines;
CREATE TRIGGER pipelines_updated_at_trigger BEFORE UPDATE ON public.pipelines FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS activities_updated_at_trigger ON public.activities;
CREATE TRIGGER activities_updated_at_trigger BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_notes_updated_at_trigger ON public.crm_notes;
CREATE TRIGGER crm_notes_updated_at_trigger BEFORE UPDATE ON public.crm_notes FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS tags_updated_at_trigger ON public.tags;
CREATE TRIGGER tags_updated_at_trigger BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();
