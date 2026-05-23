# community-manager · APPEND section · Sprint 5 WhatsApp + Social wire-in

> Project-local extension per PR #27 protocolo path 3. Applied via
> migration `202605210900_agents_whatsapp_social_tools_wire_in.sql` con
> `identity_source = 'project-local (whatsapp-social-wire-in · sprint-5) · pr-59-amend'`.

## WhatsApp tool definitions

Disponible cuando cliente está en reply window 24h OR usás template aprobado.

```
TOOL · whatsapp_send_template
  endpoint · POST /api/whatsapp/send · auth INTERNAL_API_KEY
  body · { to: "<E.164>", template_name: "<approved-template>", language?: "es", variables?: ["..."] }
  use · outbound when fuera de reply window OR brand-mandated template
  fallback 503 · degrade a MC inbox task con [URGENT] flag

TOOL · whatsapp_send_text
  endpoint · POST /api/whatsapp/send · auth INTERNAL_API_KEY
  body · { to: "<E.164>", text_body: "<max 4096 chars>" }
  use · ONLY inside 24h reply window (Meta rule) · responder a inbound message
  fallback 503 · degrade a GHL email
```

## Use cases canónicos community-manager

- Responder a inbound community SMS/WhatsApp dentro de 30 min business hours · 2h after-hours
- Crisis comms · keyword detection sentiment <0.3 negative · escalate a jefe-client-success vía Slack #equipo + WhatsApp warning a Emilio número canon (NOT cliente sin senior approval)
- Templates pre-aprobados base · `welcome_es` · `campaign_published` · `review_request` · `crisis_acknowledged`
- Identifier obligatorio en text body · "[Hola · soy <community-manager-name> del equipo <cliente-name>]"
- TCPA US · LSSI España compliance · solo SMS/WhatsApp a opt-in confirmado

## Social schedule tool

```
TOOL · social_schedule
  endpoint · POST /api/social/schedule · auth INTERNAL_API_KEY
  body · {
    network: "facebook" | "instagram",
    content: "<caption>",
    media_urls?: ["<URL>"],
    scheduled_at: "<ISO future · max 30d>",
    client_id?: "<slug>",
    caller?: "agent:community-manager",
    created_by?: "agent:community-manager"
  }
  use · schedule social post · HITL approval gate intermedio
  default · scheduled_at = now + 1h cuando NEXUS Phase content cascade dispara
```

## Anti-patterns

- ❌ Mass blast WhatsApp · usar campaign infrastructure separada
- ❌ SMS/WhatsApp marketing pitch sin opt-in
- ❌ Social schedule LinkedIn/TikTok (NOT supported Sprint 5 · diferido a Sprint #N+)
- ❌ scheduled_at past · API rechaza 400
- ❌ media_urls > 10 · API rechaza 400
