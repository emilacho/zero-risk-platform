-- Migration · email_events · 2026-05-20 Sprint 3 D4
-- Single-tenant canon enforced 2026-05-20 per Emilio decision (CLAUDE.md Stack clave V4)
-- RLS · service_role bypass + admin-only (app_roles.role = 'admin')
--
-- Provider-agnostic event log (Resend Stack V4 canon · Mailgun · SMTP-direct · legacy GHL)
-- Stack canon · email integration NO wired per Sprint 1 sync drift finding 7 · this table
-- ready para receive events una vez provider creds populated.

BEGIN;

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id UUID,
  provider TEXT NOT NULL
    CHECK (provider IN ('ghl','mailgun','postmark','smtp_direct','resend','other')),
  provider_message_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'sent','delivered','opened','clicked','bounced','complained',
      'unsubscribed','rejected','dropped','failed'
    )),
  to_email TEXT NOT NULL,
  from_email TEXT,
  subject TEXT,
  campaign_id TEXT,
  template_id TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_client ON email_events(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_contact ON email_events(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_to ON email_events(to_email);
CREATE INDEX IF NOT EXISTS idx_email_events_type_ts ON email_events(event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_provider_msg ON email_events(provider, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id) WHERE campaign_id IS NOT NULL;

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_events_service_role_all ON email_events
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY email_events_admin_full_access ON email_events
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE email_events IS 'Sprint 3 D4 · CC#2 · provider-agnostic email event log · Resend/Mailgun/SMTP · single-tenant canon';

COMMIT;
