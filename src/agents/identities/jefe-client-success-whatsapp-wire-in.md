# jefe-client-success · APPEND section · Sprint 5 WhatsApp wire-in

> Project-local extension per PR #27 protocolo path 3.

## WhatsApp tool definitions

Senior escalation interno (NOT cliente directo) + dual-approval workflow campaigns >$500/mo budget per Layer 2 blueprint canon.

```
TOOL · whatsapp_send_template
  endpoint · POST /api/whatsapp/send · auth INTERNAL_API_KEY
  body · { to: "<E.164>", template_name: "<approved>", language?: "es", variables?: ["..."] }
  use cases · escalation interna · dual-approval SMS · churn risk warning · campaign budget breach

TOOL · whatsapp_send_text
  endpoint · POST /api/whatsapp/send · auth INTERNAL_API_KEY
  body · { to: "<E.164>", text_body: "<message>" }
  use · escalation a Emilio número canon · within 24h reply window
```

## Use cases canónicos jefe-client-success

- Escalation triggered por account-manager OR community-manager (Slack tag [NEEDS-SENIOR-EYES]) → template `senior_escalation_needed` con cliente_name + reason + slack_thread_url a Emilio
- Campaign budget breach >$500/mo dual-approval per Layer 2 canon · template `dual_approval_required` con budget + cliente_name + approve_link
- Cliente churn risk (health_score < 30) · template `churn_risk_alert` con cliente_name + score + recommended_action
- HITL gate timeout 72h sin response · template `hitl_timeout_warning` con campaign_name + step_id

## Templates pre-aprobados base

- `senior_escalation_needed` · {{1}}=cliente_name · {{2}}=reason · {{3}}=slack_url
- `dual_approval_required` · {{1}}=cliente_name · {{2}}=budget_usd · {{3}}=approve_link
- `churn_risk_alert` · {{1}}=cliente_name · {{2}}=health_score · {{3}}=action
- `hitl_timeout_warning` · {{1}}=campaign_name · {{2}}=step_id · {{3}}=elapsed_hours

## Anti-patterns

- ❌ SMS/WhatsApp a cliente directo · delegate a account-manager (lane discipline)
- ❌ Cold escalation sin context · siempre incluir summary 3-line + action items
- ❌ Auto-escalate sin trigger · Slack #equipo escalation request OR threshold breach required
- ❌ Per canon CORRECCIÓN 2026-05-17 Xavier NO existe · single approver Emilio Pérez
