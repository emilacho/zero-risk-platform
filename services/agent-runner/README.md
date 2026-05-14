# Zero Risk · Agent Runner Service (Railway)

Dedicated Railway service that hosts the `@anthropic-ai/claude-agent-sdk` runtime. Lifts the SDK out of Vercel serverless functions, where Vercel's Node File Tracer (NFT) was unable to follow the SDK's dynamic require of its 219.9MB optional linux-x64 native binary.

The Vercel API route `/api/agents/run-sdk` is now a thin proxy that forwards requests to this service. n8n workflows and other callers continue hitting the same Vercel URL — they don't know the migration happened.

## Surface

| Endpoint | Method | Purpose |
|---|---|---|
| `/run-sdk` | POST | Execute one agent via the SDK. Same input/output shape as the original Vercel route. |
| `/health` | GET | Railway healthcheck. Returns `{"status":"ok"}` plus uptime. |
| `/` | GET | Service info. |

## Auth

Single shared secret in the `INTERNAL_API_KEY` env var. The Vercel proxy injects it as `x-internal-auth`; requests without the matching header get a 401. The service is **not** intended to be public-internet-reachable — Railway's default URL is fine for now, but if it ever needs to face the internet directly, add a Railway Network Privacy rule or move auth to a Railway-issued service token.

## Environment variables required

| Var | Source |
|---|---|
| `INTERNAL_API_KEY` | Same value as Vercel side. Used to authenticate the Vercel → Railway proxy hop. |
| `ANTHROPIC_API_KEY` _or_ `CLAUDE_API_KEY` | Anthropic API key. The SDK reads `ANTHROPIC_API_KEY` natively; this project also surfaces it as `CLAUDE_API_KEY`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS for `managed_agents_registry`, `agents`, `agent_skill_assignments`, `agents_log`. |
| `SUPABASE_URL` _or_ `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project URL. |
| `PORT` | Railway sets this automatically. The service reads it. |

## Why a separate service (not a Next.js standalone) and not Vercel

| Concern | Vercel | Railway service |
|---|---|---|
| SDK native binary | NFT prunes the optional dep · 219.9MB binary never lands in the function bundle · runtime throws "Native CLI binary for linux-x64 not found" | `pnpm install` puts the binary in `node_modules/` on a real Linux host · the SDK resolves it without any escape hatch |
| Cold start | Required for serverless | `sleepApplication: false` in `railway.json` keeps the container warm |
| Subprocess spawn (MCP server) | Allowed but fragile in serverless | First-class — the SDK forks `node mcp/client-brain-server.js` and stdio MCP transport works as designed |
| Maximum function size | 250MB on Pro · 219.9MB binary leaves only ~30MB headroom for `node_modules` | No equivalent limit |

## Layout

```
services/agent-runner/
├── README.md              · this file
├── package.json
├── tsconfig.json
├── railway.json           · build + deploy config
├── .gitignore
└── src/
    ├── index.ts           · Express entry · 3 routes
    ├── lib/
    │   ├── agent-sdk-runner.ts  · runAgentViaSDK · COPIED from zero-risk-platform/src/lib/
    │   ├── agent-alias-map.ts   · ghost slug resolution · COPIED verbatim
    │   ├── supabase.ts          · admin client · COPIED verbatim
    │   └── mcp/
    │       └── client-brain-server.js  · Client Brain MCP server · COPIED verbatim
    └── types/
        └── claude-agent-sdk.d.ts       · type stub · COPIED verbatim
```

**Code duplication note:** the `lib/` files are mirrored from `zero-risk-platform/src/lib/`. Until those files are extracted to a shared `packages/agent-runner-core/` workspace, **any change to the Vercel copies must be mirrored here, and vice versa**. The diff should be limited to (a) relative-import path replacements (`@/lib/...` → `./...`) in this copy, and (b) the duplicated files staying functionally identical.

## Local dev

```powershell
# from services/agent-runner/
pnpm install
pnpm dev   # tsx --watch · reloads on file changes
```

The service runs on `PORT` (default 8080) and expects all env vars listed above in a local `.env` (gitignored).

## Smoke test

```bash
# Health check
curl http://localhost:8080/health
# → {"status":"ok","uptimeSeconds":42}

# Run agent (replace token with the INTERNAL_API_KEY value)
curl -X POST http://localhost:8080/run-sdk \
  -H "Content-Type: application/json" \
  -H "x-internal-auth: $INTERNAL_API_KEY" \
  -d '{"agentName":"jefe-marketing","task":"Hola, saludo corto.","clientId":null,"pipelineId":null,"stepName":null}'
```

Expected: HTTP 200 with `{"success":true,"response":"...","sessionId":"sess_...","inputTokens":N,"outputTokens":M,"costUsd":0.0xx,"durationMs":NNNN,"model":"claude-sonnet-4-6"}`.

## Upgrade SDK

When upgrading `@anthropic-ai/claude-agent-sdk` in this service, also bump it in `zero-risk-platform/package.json` to keep the proxy and runner on the same major.minor. Then run `pnpm install` in both locations.
