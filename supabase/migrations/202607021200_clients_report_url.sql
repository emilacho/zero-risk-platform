-- clients.report_url · onboarding executive report (Google Slides) URL.
-- Written by POST /api/onboarding/report/[clientId] after rendering the deck
-- into Drive Cuentas/[client]/. Additive · nullable · idempotent.
-- Aplicación · Management API o `supabase db query --linked -f` · NO db push.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS report_url TEXT;

COMMENT ON COLUMN public.clients.report_url IS
  'URL de la presentación ejecutiva de onboarding en Google Slides (CC#3 2026-07-02).';

-- Rollback · ALTER TABLE public.clients DROP COLUMN IF EXISTS report_url;
