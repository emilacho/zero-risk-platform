-- Migration · sms_events · 2026-05-20 Sprint 3 D4
-- CC#2 multi-tenant scope · tenant_id + RLS canon (see 202605200100_*.sql preamble)
-- Companion to email_events · same provider-agnostic pattern.

BEGIN;

CREATE TABLE IF NOT EXISTS sms_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'zero-risk-default',
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

CREATE INDEX IF NOT EXISTS idx_sms_events_tenant ON sms_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_events_client ON sms_events(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_events_contact ON sms_events(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_events_to ON sms_events(to_phone);
CREATE INDEX IF NOT EXISTS idx_sms_events_type_ts ON sms_events(event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sms_events_provider_msg ON sms_events(provider, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_events_campaign ON sms_events(campaign_id) WHERE campaign_id IS NOT NULL;

ALTER TABLE sms_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_events_service_role_all ON sms_events
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY sms_events_tenant_scoped_select ON sms_events
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY sms_events_tenant_scoped_insert ON sms_events
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

COMMENT ON TABLE sms_events IS 'Sprint 3 D4 · CC#2 · provider-agnostic SMS event log · Twilio/GHL/MessageBird';

COMMIT;
