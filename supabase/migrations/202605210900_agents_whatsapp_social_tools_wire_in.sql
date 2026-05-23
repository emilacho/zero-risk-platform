-- Sprint 5 wire-in · canonical sync per PR #27 protocolo path 3 ·
-- project-local override append a `agents.identity_content` para 4
-- agentes target ·
--
--   community-manager       · WhatsApp send + social_schedule
--   account-manager         · WhatsApp send (client check-ins)
--   jefe-client-success     · WhatsApp send (senior escalation)
--   editor-en-jefe          · social_schedule (NEXUS content cascade)
--
-- Identity source canónico · `project-local (whatsapp-social-wire-in ·
-- sprint-5) · pr-59-amend`. Idempotente · safe re-run · solo UPDATE cuando
-- la APPEND section no está presente todavía.
--
-- APPEND content lives en archivos `src/agents/identities/<slug>-*-wire-in.md`
-- para audit trail · este migration concatena base identity_content +
-- archivo APPEND post-deploy (load file content via initialization · pero
-- per Path 3 canónico usamos UPSERT con identity_content literal aquí).
--
-- NOTE · migration LISTO pero requires Emilio approval + Twilio/Meta keys
-- live antes de apply. Sin keys el wire es no-op (endpoint returns 503 graceful).

DO $$
DECLARE
  cm_base TEXT;
  am_base TEXT;
  jcs_base TEXT;
  eej_base TEXT;
  wa_append TEXT := E'\n\n## WhatsApp tools wire-in (Sprint 5 · project-local extension)\n\n' ||
    'Tools disponibles · `whatsapp_send_template(to, template_name, variables)` ' ||
    'y `whatsapp_send_text(to, body)` apuntando a POST /api/whatsapp/send (auth ' ||
    'INTERNAL_API_KEY). Fallback graceful 503 sin keys · degrade a GHL email ' ||
    'OR MC inbox task. Templates base · campaign_published · approval_request_urgent ' ||
    '· weekly_status · senior_escalation_needed · churn_risk_alert.';
  social_append TEXT := E'\n\n## Social schedule tool wire-in (Sprint 5 · project-local extension)\n\n' ||
    'Tool · `social_schedule(network, content, media_urls, scheduled_at)` apuntando ' ||
    'a POST /api/social/schedule (auth INTERNAL_API_KEY). Default status=pending_approval ' ||
    'pre-HITL gate · admin aprueba → scheduled → n8n cron publica via Meta Graph v21. ' ||
    'IG + FB only Sprint 5 · LinkedIn/TikTok diferidos.';
BEGIN
  -- community-manager · WhatsApp + social
  SELECT identity_content INTO cm_base FROM agents WHERE name = 'community-manager';
  IF cm_base IS NOT NULL AND cm_base NOT LIKE '%WhatsApp tools wire-in (Sprint 5%' THEN
    UPDATE agents
    SET identity_content = cm_base || wa_append || social_append,
        identity_source = 'project-local (whatsapp-social-wire-in · sprint-5) · pr-59-amend',
        updated_at = NOW()
    WHERE name = 'community-manager';
  END IF;

  -- account-manager · WhatsApp solo
  SELECT identity_content INTO am_base FROM agents WHERE name = 'account-manager';
  IF am_base IS NOT NULL AND am_base NOT LIKE '%WhatsApp tools wire-in (Sprint 5%' THEN
    UPDATE agents
    SET identity_content = am_base || wa_append,
        identity_source = 'project-local (whatsapp-wire-in · sprint-5) · pr-59-amend',
        updated_at = NOW()
    WHERE name = 'account-manager';
  END IF;

  -- jefe-client-success · WhatsApp solo (escalation)
  SELECT identity_content INTO jcs_base FROM agents WHERE name = 'jefe-client-success';
  IF jcs_base IS NOT NULL AND jcs_base NOT LIKE '%WhatsApp tools wire-in (Sprint 5%' THEN
    UPDATE agents
    SET identity_content = jcs_base || wa_append,
        identity_source = 'project-local (whatsapp-wire-in · sprint-5) · pr-59-amend',
        updated_at = NOW()
    WHERE name = 'jefe-client-success';
  END IF;

  -- editor-en-jefe · social_schedule solo (NEXUS content cascade)
  SELECT identity_content INTO eej_base FROM agents WHERE name = 'editor-en-jefe';
  IF eej_base IS NOT NULL AND eej_base NOT LIKE '%Social schedule tool wire-in (Sprint 5%' THEN
    UPDATE agents
    SET identity_content = eej_base || social_append,
        identity_source = 'project-local (social-schedule-wire-in · sprint-5) · pr-59-amend',
        updated_at = NOW()
    WHERE name = 'editor-en-jefe';
  END IF;
END $$;

COMMENT ON COLUMN agents.identity_content IS
  'Sprint 5 wire-in · 4 agentes con WhatsApp + social_schedule tools appended '
  'per PR #27 protocolo path 3 · 2026-05-21 (community-manager · account-manager '
  '· jefe-client-success WhatsApp · editor-en-jefe social_schedule).';
