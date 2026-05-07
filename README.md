# Zero Risk Platform V3

Agentic marketing platform that powers Zero Risk Agency. Industry-agnostic by
design (the first client is Zero Risk Ecuador, an industrial-safety
company, but the platform serves any vertical).

## Architecture (4 Layers + Mission Control)

| Layer | Technology | Status |
|-------|-----------|--------|
| 1. AI Agents | Claude Managed Agents (Anthropic API) + 31 identidades | Live |
| 2. Orchestration | n8n (business workflows only — no agents) | Live |
| 3. Landing Pages | Next.js 14 + Tailwind | Scaffold |
| 4. Backend | Supabase + Next.js 14 API routes | Live |
| Mission Control | Open-source local-first dashboard (Railway) | Live |

Detailed architecture: `docs/02-arquitectura/ARQUITECTURA_V3.md`.

## Camino III HITL · Editor en Jefe + Brand Strategist (dual-review)

Whitelist of 15 content-producing agents in `src/lib/editor-routing.ts`.
When any of them emits content via `/api/agents/run`, `/api/agents/run-sdk`,
or `/api/agents/generate-content`, the request automatically flows through
`runDualReviewMiddleware` and lands in the Mission Control HITL inbox if
either reviewer escalates. Slug normalization (`normalizeAgentSlug`)
resolves snake_case, mixed-case, and semantic legacy aliases
(`copywriter`, `landing_optimizer`, `qbr_generator`, etc.) before the
whitelist lookup.

Opt-out for trusted internal calls: `x-skip-editor-middleware: 1` header.

## Brand Book Viewer

Per-client viewer at `/brand-book/[clientId]` plus JSON API at
`/api/brand-book/[clientId]`. Pulls from `clients`, `client_brand_books`,
and `client_icp_documents` (see `sql/client_brain_schema.sql`). 5 tabs:
Voice & Tone, ICPs, Visual Identity, Messaging Pillars, Forbidden Words.

## MCP server scaffolds (`packages/`)

Four service-specific MCP servers ready for the implementation sprint:

| Package | Service | Tools (planned) |
|---------|---------|-----------------|
| `@zero-risk/ghl-mcp-server` | GoHighLevel | 13 |
| `@zero-risk/dataforseo-mcp-server` | DataForSEO | 12 |
| `@zero-risk/apify-mcp-server` | Apify scrapers | 6 |
| `@zero-risk/higgsfield-mcp-server` | Higgsfield video | 4 |

Each ships with package.json, tsconfig.json, README, MCP entrypoint, API
client wrapper, and vitest skeleton. Handlers throw `not_implemented`
until the per-service implementation sprint.

Excluded from the root tsconfig — install standalone via
`cd packages/<name> && pnpm install`.

## Setup

```bash
pnpm install
cp .env.local.example .env.local
# Fill in Supabase credentials, INTERNAL_API_KEY, CLAUDE_API_KEY, etc.
pnpm dev
```

Required env (minimum):
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_API_KEY` (gate for /api/agents/* + /api/integrations/*)
- `CLAUDE_API_KEY`
- `NEXT_PUBLIC_BASE_URL` (used by middleware to construct callback URLs)

Optional / capability-gated:
- `N8N_API_KEY` — unlocks workflow patcher scripts and full smoke harness
- `MC_API_TOKEN`, `MC_BASE_URL` — Mission Control bridge dual-write
- `POSTHOG_*`, `SENTRY_*`, `HEALTHCHECKS_*` — observability

## Project Structure

```
zero-risk-platform/
├── src/
│   ├── app/
│   │   ├── api/                    # Backend API routes (incl. /api/agents/*, /api/brand-book/[id])
│   │   ├── brand-book/[clientId]/  # Per-client Brand Book viewer
│   │   └── (dashboard)/            # Mission Control adjacent pages
│   ├── lib/
│   │   ├── editor-routing.ts       # Camino III whitelist + slug normalizer + aggregate verdict
│   │   ├── editor-middleware.ts    # runDualReviewMiddleware
│   │   ├── agent-alias-map.ts      # AGENT_ALIAS_MAP + MANIFEST_31_SLUGS + resolveAgentSlug
│   │   ├── client-brain.ts         # RAG context builder for agents
│   │   └── supabase{,-admin,-server,-auth}.ts
│   └── components/
├── packages/                        # MCP servers (scaffold)
├── n8n-workflows/                   # n8n JSON exports + skeletons (deployable)
├── scripts/
│   ├── audit/                       # Workflow signal extractor + ghost-agents scanner
│   └── smoke-test/                  # Smoke harness (agents + workflows)
├── sql/                             # Schema + migrations
├── audit-output/                    # Workflow JSON snapshots + analysis reports
├── __tests__/                       # vitest suite (485+ tests)
└── supabase/                        # Functions + RLS policies
```

## Tests

```bash
pnpm test                    # full suite
pnpm test editor-routing     # one filter
pnpm typecheck               # tsc --noEmit
```

## Smoke harness

```bash
node scripts/smoke-test/run.mjs inspect       # health check
node scripts/smoke-test/run.mjs agents        # 27 agents in parallel
node scripts/smoke-test/run.mjs workflows     # n8n workflows (needs N8N_API_KEY)
node scripts/smoke-test/run.mjs all           # everything
```

Output: `scripts/smoke-test/out/smoke-<timestamp>.{csv,md}`. Fail-by-pattern
triage instead of fix-by-unit. Manual: `scripts/smoke-test/README.md`.

## Ghost-agent audit

```bash
node scripts/audit/ghost-agents-scan.mjs      # buckets all wf slugs into canonical/alias/ghost
```

Output: `scripts/audit/out/ghost-agents-<timestamp>.json` plus the
human-readable decision log in `outputs/GHOST_AGENTS_AUDIT_<date>.md`.

## Contracts (governance)

Every input schema lives in `src/lib/contracts/inputs/<endpoint>.json` and is
validated server-side by `validateObject` before any side-effects. Adding
or modifying an endpoint requires a new schema file. Tests in
`__tests__/contract-schemas.test.ts` enforce that every consumer endpoint
has a matching contract.
