-- Migration · sms_events · 2026-05-20 Sprint 3 D4
-- Single-tenant canon enforced 2026-05-20 per Emilio decision (CLAUDE.md Stack clave V4)
-- RLS · service_role bypass + admin-only (app_roles.role = 'admin')
-- Companion to email_events · same provider-agnostic pattern.

BEGIN;

CREATE TABLE IF NOT EXISTS sms_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id UUID,
  provider TEXT NOT NULL
    CHECK (provider IN ('twilio','ghl_sms','messagebird','plivo','other')),
  provider_message_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'queued','sending','sent','delivered','received',
      'failed','undelivered','read','opted_out'
    )),
  to_phone TEXT NOT NULL,
  from_phone TEXT,
  message_body TEXT,
  media_urls TEXT[],
  campaign_id TEXT,
  cost_usd NUMERIC(8,4),
  segments INTEGER,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_events_client ON sms_events(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_events_contact ON sms_events(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_events_to ON sms_events(to_phone);
CREATE INDEX IF NOT EXISTS idx_sms_events_type_ts ON sms_events(event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sms_events_provider_msg ON sms_events(provider, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_events_campaign ON sms_events(campaign_id) WHERE campaign_id IS NOT NULL;

ALTER TABLE sms_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_events_service_role_all ON sms_events
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY sms_events_admin_full_access ON sms_events
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE sms_events IS 'Sprint 3 D4 · CC#2 · provider-agnostic SMS event log · Twilio/MessageBird · single-tenant canon';

COMMIT;
