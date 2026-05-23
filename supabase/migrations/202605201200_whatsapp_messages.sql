-- Sprint 4 · WhatsApp Business · single-tenant log table.
--
-- Stores all outbound + inbound WhatsApp messages (per Meta Cloud API
-- v21 graph endpoint · NOT Twilio) · provider_message_id is Meta's WAMID.
-- Per decision `zr-vault/wiki/decisions/2026-05-20-whatsapp-meta-graph-direct-vs-twilio.md`
-- direct Meta · save ~40% per message vs Twilio markup.
--
-- Idempotent · safe to re-run.

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction            TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  contact_id           UUID,
  phone_number         TEXT NOT NULL,
  template_name        TEXT,
  body                 TEXT,
  status               TEXT NOT NULL DEFAULT 'sent'
                       CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  provider_message_id  TEXT UNIQUE,
  meta_payload         JSONB,
  error_code           TEXT,
  error_detail         TEXT,
  caller               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_created
  ON whatsapp_messages (phone_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction_status
  ON whatsapp_messages (direction, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_id
  ON whatsapp_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact
  ON whatsapp_messages (contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_messages_service_role_all"
  ON whatsapp_messages;

CREATE POLICY "whatsapp_messages_service_role_all"
  ON whatsapp_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE whatsapp_messages IS
  'WhatsApp Business message log · Meta Cloud API v21 direct (NOT Twilio). '
  'provider_message_id is Meta WAMID. Status flows: queued → sent → delivered → read OR failed. '
  'Direction in=inbound from contact · out=outbound from us. '
  'Caller: POST /api/whatsapp/send (out) + POST /api/whatsapp/webhook (in + status updates).';
