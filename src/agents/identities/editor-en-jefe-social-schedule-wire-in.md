# editor-en-jefe · APPEND section · Sprint 5 Social schedule wire-in

> Project-local extension per PR #27 protocolo path 3. Acompaña al
> existing project-local override `editor_en_jefe.md` (video AI tool canon
> · PR #52 lineage).

## Social schedule tool

```
TOOL · social_schedule
  endpoint · POST /api/social/schedule · auth INTERNAL_API_KEY
  body · {
    network: "facebook" | "instagram",
    content: "<caption · brand voice del cliente>",
    media_urls?: ["<URL artifact generado por video AI / image AI>"],
    scheduled_at: "<ISO future · max 30d>",
    client_id?: "<slug>",
    created_by?: "agent:editor-en-jefe",
    caller?: "agent:editor-en-jefe-nexus-content-cascade"
  }
  use · post-content production · schedule social caption con HITL approval gate intermedio (status='pending_approval' default)
  fallback · DB error · row con status='failed' · audit trail preserved
```

## Use cases canónicos editor-en-jefe

- NEXUS Phase content cascade · post-creative_concepts (Phase 3) · agent emit `social_caption` + `network` + `media_urls` (output del worker-creative + worker-video) → editor-en-jefe wire al hook `firePostDispatchHooks` (via journey-orchestrator dispatch.ts) → INSERT row social_posts pending_approval
- HITL approval gate · MC inbox surface · admin aprueba → status='scheduled' → n8n cron 5min publica via Meta Graph v21
- Video AI tool selection per playbook `video-ai-tool-selection-veo-vs-seedance.md` · media_urls puede ser Veo 3.1 · Seedance output URL (Higgsfield canonical retired · Stack V4 audit 2026-05-22 · referencia histórica solo)

## Anti-patterns

- ❌ network LinkedIn/TikTok · Sprint 5 supporta solo facebook + instagram (Sprint #N+ extensions)
- ❌ scheduled_at past · API rechaza 400
- ❌ media_urls > 10 · API rechaza 400
- ❌ status='scheduled' direct sin HITL gate · violates Layer 2 approval canon (use 'pending_approval')

## Related

- `editor_en_jefe.md` (canonical project-local · video AI tool canon · PR #52)
- `wiki/playbooks/video-ai-tool-selection-veo-vs-seedance.md` (sibling canon)
- `2026-05-20-social-planner-camino-elegido.md` (vault decision Sprint 4)
