-- Gap 1 · Brand identity injection on clients table
--
-- The Náufrago v1 dogfood (master workflow 7196 · 2026-05-16) surfaced that
-- the creative-director agent was inventing palette + imagery direction
-- because the cliente row carried no uploaded brand assets · canon stack
-- delivers higher coherence when the agent respects an explicit logo +
-- colors + fonts the cliente already owns.
--
-- This migration adds 3 nullable columns. Webhook payload extends to accept
-- `client_logo_url`, `client_brand_colors`, `client_brand_fonts` · the
-- Onboarding E2E v2 workflow persists them into the row · the new
-- /api/cascade/onboard endpoint passes them as context to creative-director
-- as MANDATORY input (NOT invent · respect uploaded).
--
-- Idempotent · ADD COLUMN IF NOT EXISTS.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS logo_url      TEXT,
  ADD COLUMN IF NOT EXISTS brand_colors  JSONB,
  ADD COLUMN IF NOT EXISTS brand_fonts   TEXT[];

COMMENT ON COLUMN clients.logo_url IS
  'Public URL of the cliente-uploaded logo · passed as MANDATORY context to '
  'creative-director during the onboarding cascade (Gap 1 fix · 2026-05-16).';
COMMENT ON COLUMN clients.brand_colors IS
  'Cliente-provided brand palette as JSONB array of {hex, name?} objects · '
  'creative-director MUST respect these instead of inventing.';
COMMENT ON COLUMN clients.brand_fonts IS
  'Cliente-provided typography choices as text[] · web-designer + creative-'
  'director respect them in section specs.';
