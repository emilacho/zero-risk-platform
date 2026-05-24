-- Sprint 8 A5 · canonical `contacts` table for the CRM nativo (Supabase).
--
-- Stack V4 row 5 (CRM · "Supabase nativo · 7 tablas live · write desde
-- Orchestrator pending") had a ground-truth gap · only `leads` existed in
-- prod. CC#2 A5 audit found 0 rows in contacts/companies/deals/etc.
-- This migration starts the CRM build-out with the most-needed table ·
-- companies/deals/activities/pipelines/crm_notes deferred to Sprint 8C
-- per dispatch budget.
--
-- Writer · OnboardingOrchestrator Day-1 web discovery captures emails +
-- phones + address from the cliente's website. Pre-A5 this only lived in
-- onboarding_sessions.scrape_metadata JSONB · now persists to canonical
-- contacts rows for sales-CRM consumption.
--
-- Schema design · normalized 1-row-per-contact-value over a wide table
-- because ·
--   - email/phone/address have very different shapes · 1 column each invites
--     mismatch and untyped collisions
--   - scrape returns N emails + N phones per cliente · normalized scales
--   - future sources (tally form · manual entry · CSV import) reuse the
--     same shape with different `source` values
--
-- Idempotent · ALTER TABLE ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT
-- EXISTS. Safe re-run.

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email', 'phone', 'address', 'social_handle', 'other')),
  value text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_metadata jsonb DEFAULT '{}'::jsonb,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contacts IS
  'Sprint 8 A5 · canonical CRM contacts · 1-row-per-(client_id, kind, value). Sources include web_discovery (OnboardingOrchestrator), tally_form, manual, csv_import.';
COMMENT ON COLUMN public.contacts.kind IS 'Discriminator · email | phone | address | social_handle | other.';
COMMENT ON COLUMN public.contacts.source IS 'Provenance · web_discovery | tally_form | manual | csv_import | nexus_phase_7 | etc.';
COMMENT ON COLUMN public.contacts.source_metadata IS 'Optional · scraped_page_url, form_id, csv_row_index, agent_run_id, etc.';

-- Dedupe within a client · upsert from OnboardingOrchestrator uses this.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_client_kind_value_uniq
  ON public.contacts (client_id, kind, value);

-- Hot path · "list all contacts for client X" + "find contact by email"
CREATE INDEX IF NOT EXISTS contacts_client_id_idx ON public.contacts (client_id);
CREATE INDEX IF NOT EXISTS contacts_value_idx ON public.contacts (value);

-- RLS · service_role can do everything · canonical CRM data should NOT be
-- exposed via the public anon key.
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_service_role_all ON public.contacts;
CREATE POLICY contacts_service_role_all ON public.contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- updated_at auto-bump trigger
CREATE OR REPLACE FUNCTION public.contacts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_updated_at_trigger ON public.contacts;
CREATE TRIGGER contacts_updated_at_trigger
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.contacts_set_updated_at();
