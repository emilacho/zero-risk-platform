-- Migration · landings · 2026-05-20 Sprint 4 · Landings infrastructure
-- Single-tenant canon (per PR #56 pattern) · admin-only RLS
-- Opción B canon · subdirectorio app/landings/[slug] dentro de zero-risk-platform
-- Public read of active landings · admin-gated writes
-- Bumped from 202605201200 → 202605201300 to avoid collision with concurrent CC1/3 whatsapp_messages migration

BEGIN;

CREATE TABLE IF NOT EXISTS landings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  hero_headline TEXT NOT NULL,
  hero_subhead TEXT,
  hero_image_url TEXT,
  cta_text TEXT NOT NULL DEFAULT 'Comenzar',
  cta_url TEXT NOT NULL DEFAULT '#',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_description TEXT,
  meta_og_image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  vertical TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$')
);

CREATE INDEX IF NOT EXISTS idx_landings_slug ON landings(slug);
CREATE INDEX IF NOT EXISTS idx_landings_active ON landings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_landings_client ON landings(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_landings_vertical ON landings(vertical) WHERE vertical IS NOT NULL;

ALTER TABLE landings ENABLE ROW LEVEL SECURITY;

CREATE POLICY landings_service_role_all ON landings
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY landings_admin_full_access ON landings
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY landings_anon_read_active ON landings
  AS PERMISSIVE FOR SELECT TO anon
  USING (is_active = true);

COMMENT ON TABLE landings IS 'Sprint 4 · CC#2 · landing pages config · /landings/[slug] dynamic route · single-tenant canon · admin write · anon read active';

COMMIT;
