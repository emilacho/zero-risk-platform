-- Migration · client_expansion_signals · 2026-05-20 Sprint 3 D4
-- Single-tenant canon enforced 2026-05-20 per Emilio decision (CLAUDE.md Stack clave V4)
-- RLS · service_role bypass + admin-only (app_roles.role = 'admin')

BEGIN;

CREATE TABLE IF NOT EXISTS client_expansion_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL
    CHECK (signal_type IN (
      'usage_spike','feature_adoption','team_growth','nps_high',
      'champion_promoted','referral_made','renewal_due','contract_expansion_mentioned',
      'pricing_inquiry','competitor_evaluation','custom'
    )),
  signal_strength TEXT NOT NULL DEFAULT 'medium'
    CHECK (signal_strength IN ('weak','medium','strong','urgent')),
  signal_source TEXT,
  detected_by_agent TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  recommended_action TEXT,
  action_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (action_status IN ('pending','acknowledged','in_progress','completed','dismissed')),
  actioned_by TEXT,
  actioned_at TIMESTAMPTZ,
  expected_value_usd NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expansion_client ON client_expansion_signals(client_id);
CREATE INDEX IF NOT EXISTS idx_expansion_type ON client_expansion_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_expansion_pending ON client_expansion_signals(action_status, signal_strength) WHERE action_status = 'pending';

ALTER TABLE client_expansion_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY expansion_service_role_all ON client_expansion_signals
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY expansion_admin_full_access ON client_expansion_signals
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE client_expansion_signals IS 'Sprint 3 D4 · CC#2 · agentes detectan + log signals for account expansion + renewal · single-tenant canon';

COMMIT;
