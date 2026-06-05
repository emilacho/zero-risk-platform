-- Migration · sala ingress · 2 tables + 1 seed source + 1 seed routing rule
-- Phase 1 prep · Opus VEREDICTO 2026-06-05 · ESCALADA-Opus-arquitectura-entradas-sala-multidepto
--
-- §148 honest · this migration is NOT applied by CI · CC#1 (or service-role
-- equivalent) applies post-merge per canon. NO behavior depends on this until
-- the /api/sala/intake endpoint reads from these tables.
--
-- Reversibility · DROP TABLE both at the bottom (rollback path). Cero-effect
-- pre-application · cero callers without the endpoint flag flipped.

-- ─── ingress_sources · source → tier + auth + scope ───
CREATE TABLE IF NOT EXISTS public.ingress_sources (
  source TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('A', 'B', 'C')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('internal_key', 'hmac', 'public_gate')),
  auth_secret_env_var TEXT,
  intents_allowed TEXT[] NOT NULL CHECK (array_length(intents_allowed, 1) >= 1),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ingress_sources IS
  'Sala ingress · source taxonomy · tier A=internal trusted (Emilio/MC · internal_key)' ||
  ' · tier B=partner (CRM · HMAC) · tier C=public (ADR-012 full gate). intents_allowed' ||
  ' is the scope · the endpoint rejects (source, intent) outside scope.';

-- ─── routing_rules · (source, intent) → journey + worker ───
CREATE TABLE IF NOT EXISTS public.routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL REFERENCES public.ingress_sources(source) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  journey_type TEXT NOT NULL,
  worker_workflow_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS routing_rules_active_source_intent_unique
  ON public.routing_rules (source, intent)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS routing_rules_journey_idx
  ON public.routing_rules (journey_type)
  WHERE active = TRUE;

COMMENT ON TABLE public.routing_rules IS
  'Sala ingress routing · (source, intent) → journey_type + worker_workflow_id.' ||
  ' Single active rule per (source, intent) enforced by unique partial index.' ||
  ' worker_workflow_id may be NULL when journey is not Model B opt-in (legacy agent path).';

-- ─── RLS · service_role only (Náufrago single-tenant · no row-level scoping needed)
ALTER TABLE public.ingress_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS by default; deny-all policy keeps anon/authenticated out
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ingress_sources' AND policyname='deny_all_non_service'
  ) THEN
    CREATE POLICY deny_all_non_service ON public.ingress_sources FOR ALL TO PUBLIC USING (FALSE);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='routing_rules' AND policyname='deny_all_non_service'
  ) THEN
    CREATE POLICY deny_all_non_service ON public.routing_rules FOR ALL TO PUBLIC USING (FALSE);
  END IF;
END $$;

-- ─── Seed · Phase 1 Náufrago piloto ───
-- 1 source: ventas/deal-won · tier B · HMAC auth
INSERT INTO public.ingress_sources
  (source, tier, auth_method, auth_secret_env_var, intents_allowed, description)
VALUES
  (
    'ventas/deal-won',
    'B',
    'hmac',
    'SALA_INGRESS_VENTAS_HMAC_SECRET',
    ARRAY['onboard'],
    'Sales · deal closed event · partner CRM (HMAC signed) · canon seed Phase 1 Náufrago'
  )
ON CONFLICT (source) DO NOTHING;

-- 1 routing rule: ventas/deal-won + onboard → ONBOARD journey · LyVoKcrypS5uLyuu worker
INSERT INTO public.routing_rules
  (source, intent, journey_type, worker_workflow_id, description)
VALUES
  (
    'ventas/deal-won',
    'onboard',
    'ONBOARD',
    'LyVoKcrypS5uLyuu',
    'Náufrago piloto Phase 1 · Client Onboarding E2E v2 (Webhook Deal Won)'
  )
ON CONFLICT DO NOTHING;

-- ─── Verify (manual · for the apply runbook) ───
-- SELECT * FROM public.ingress_sources;
-- SELECT * FROM public.routing_rules;

-- ─── Rollback ───
-- DROP TABLE IF EXISTS public.routing_rules;
-- DROP TABLE IF EXISTS public.ingress_sources;
