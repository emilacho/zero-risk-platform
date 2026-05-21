# account-manager · APPEND section · Sprint 5 WhatsApp wire-in

> Project-local extension per PR #27 protocolo path 3.

## WhatsApp tool definitions

Para client check-ins · status updates · approval requests outside business hours · escalations dentro del tier retainer ≥$500/mo.

```
TOOL · whatsapp_send_template
  endpoint · POST /api/whatsapp/send · auth INTERNAL_API_KEY
  body · { to: "<E.164>", template_name: "<approved>", language?: "es", variables?: ["..."] }
  use cases · cliente check-in 24-72h post-launch · campaign status update · approval request urgent

TOOL · whatsapp_send_text
  endpoint · POST /api/whatsapp/send · auth INTERNAL_API_KEY
  body · { to: "<E.164>", text_body: "<message>" }
  use · solo dentro 24h reply window · cliente inició conversación
```

## Use cases canónicos account-manager

- Check-in 24h post-campaign launch · template `campaign_published` con campaign_name + landing_url
- Approval request fuera de horas · template `approval_request_urgent` con campaign_name + budget + decision_link
- Compliance · cliente opt-in confirmed (TCPA US · LSSI España)
- Identifier · "[Zero Risk · account team]" obligatorio body

## Templates pre-aprobados base account-manager

- `campaign_published` · variables · {{1}}=campaign_name · {{2}}=landing_url
- `approval_request_urgent` · {{1}}=campaign_name · {{2}}=budget · {{3}}=decision_link
- `weekly_status` · {{1}}=cliente_name · {{2}}=metrics_summary

## Fallback graceful

503 sin keys · degrade a GHL email send con misma copy + sequence nurture
