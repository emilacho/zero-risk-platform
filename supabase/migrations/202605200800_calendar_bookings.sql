-- Migration · calendar_bookings · 2026-05-20 Sprint 3 D4
-- CC#2 multi-tenant scope · tenant_id + RLS canon (see 202605200100_*.sql preamble)
--
-- Cal.com self-host integration · Sprint 3 D1 deployed cal-com service en peaceful-spirit Railway ·
-- domain https://cal-com-production-e55b.up.railway.app · webhook handler en
-- /api/calendar/webhook/route.ts (Sprint 3 D4 deliverable · graceful 503 stub sin CAL_COM_API_KEY).
-- GHL Calendar nativo (canon previo per STACK_FINAL_V3) preservado como fallback via provider column.

BEGIN;

CREATE TABLE IF NOT EXISTS calendar_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'zero-risk-default',
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id UUID,
  champion_id UUID REFERENCES client_champions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'cal_com'
    CHECK (provider IN ('cal_com','ghl_calendar','google_calendar','outlook','other')),
  provider_booking_id TEXT,
  event_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cancelled','no_show','completed','rescheduled')),
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  attendee_name TEXT,
  attendee_email TEXT,
  attendee_phone TEXT,
  organizer_email TEXT,
  meeting_url TEXT,
  meeting_location TEXT,
  notes TEXT,
  cancellation_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  webhook_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_time_valid CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS idx_calendar_tenant ON calendar_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calendar_client ON calendar_bookings(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_contact ON calendar_bookings(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_champion ON calendar_bookings(champion_id) WHERE champion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_status ON calendar_bookings(status) WHERE status NOT IN ('completed','cancelled','no_show');
CREATE INDEX IF NOT EXISTS idx_calendar_provider_id ON calendar_bookings(provider, provider_booking_id) WHERE provider_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_scheduled ON calendar_bookings(scheduled_start);

ALTER TABLE calendar_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_service_role_all ON calendar_bookings
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY calendar_tenant_scoped_select ON calendar_bookings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY calendar_tenant_scoped_insert ON calendar_bookings
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY calendar_tenant_scoped_update ON calendar_bookings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'))
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

COMMENT ON TABLE calendar_bookings IS 'Sprint 3 D4 · CC#2 · multi-provider calendar bookings · Cal.com (sprint 3 D1 deploy) · GHL Calendar · Google/Outlook · webhook_payload preserves raw provider data';

COMMIT;
