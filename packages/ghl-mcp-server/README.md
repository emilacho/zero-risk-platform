# @zero-risk/ghl-mcp-server

> **🚨 STATUS · DEPRECATED · SUNSET 2026-06-04** (Sprint 6 Track C1 · Stack V4 GHL-OUT canon)
>
> Per `zr-vault/wiki/decisions/2026-05-21-ghl-mcp-deprecation-stack-v4.md` · this MCP server is NOT registered en `agent-sdk-runner.ts` mcpServers map starting 2026-05-21. Canonical replacements ·
> - Email · `/api/email/send` (Resend wrapper · `src/lib/email/resend.ts`)
> - Contacts · Supabase nativo (`client_champions` table + Sprint 6 Track A2)
> - Landing pages · client-sites repo (Next.js direct)
> - SMS · `/api/sms/send` (Twilio · `src/lib/sms/twilio.ts`)
> - WhatsApp · `/api/whatsapp/send` (Meta Graph directo · `src/lib/whatsapp/meta-graph.ts`)
>
> Package will be moved to `packages/_archived/ghl-mcp-server/` on 2026-06-04. Until then, sources remain in tree for audit + rollback.

---


MCP server exposing GoHighLevel as Claude tools.

**Status:** Scaffold only — Block 11 of CC#1 sprint 2026-05-07. Tool implementations are stubs that throw `not_implemented`. Implementation sprint will wire each tool to the real GHL API.

## Tools (planned · 13)

### Contacts
- `ghl_create_contact` · `{firstName, lastName?, email?, phone?, tags?}`
- `ghl_search_contacts` · `{query, limit?}`
- `ghl_update_contact` · `{contactId, fields}`
- `ghl_add_tag` · `{contactId, tags[]}`

### Conversations / WhatsApp / Email
- `ghl_send_whatsapp` · `{contactId, message}`
- `ghl_send_email` · `{contactId, subject, htmlBody, replyToEmail?}`
- `ghl_get_conversation` · `{conversationId}`

### Pipelines / Opportunities
- `ghl_create_opportunity` · `{pipelineId, contactId, name, monetaryValue, status}`
- `ghl_move_opportunity` · `{opportunityId, newStageId}`
- `ghl_list_pipelines` · `{}`

### Calendars
- `ghl_book_appointment` · `{calendarId, contactId, slotIso, duration_min}`
- `ghl_get_available_slots` · `{calendarId, dateRange}`

### Forms
- `ghl_get_form_submissions` · `{formId, since}`

## Required env

```
GHL_PRIVATE_KEY=<bearer token from Vault credential 'ghl-private-key'>
GHL_LOCATION_ID=<from Vault credential 'ghl-location-id'>
```

## Connect to Claude

```json
{
  "mcpServers": {
    "zr-ghl": {
      "command": "node",
      "args": ["<repo>/zero-risk-platform/packages/ghl-mcp-server/dist/index.js"],
      "env": {
        "GHL_PRIVATE_KEY": "...",
        "GHL_LOCATION_ID": "..."
      }
    }
  }
}
```

## Develop

```bash
cd packages/ghl-mcp-server
pnpm install
pnpm dev      # tsx hot-reload
pnpm test     # vitest
pnpm build    # → dist/
```
