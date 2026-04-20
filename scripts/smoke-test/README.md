# Zero Risk — Smoke Test Harness

Scientific-grade parallel test harness for the 27+ agentes y 45 n8n workflows.
Replaces the manual "fire webhook, wait, query API" loop with a single reproducible CLI.

## Quickstart

```powershell
cd C:\Users\emila\Documents\Claude\Projects\Agentic Business Agency\zero-risk-platform

# 1) Health check (no cost)
node scripts/smoke-test/run.mjs inspect

# 2) List agents/workflows without calling them
node scripts/smoke-test/run.mjs agents --dry-run
node scripts/smoke-test/run.mjs workflows --dry-run

# 3) Test all 27+ agents in parallel (costs ~$1 in Claude tokens)
node scripts/smoke-test/run.mjs agents

# 4) Test Cluster 1 workflows
node scripts/smoke-test/run.mjs workflows --cluster=NEXUS
node scripts/smoke-test/run.mjs workflows --cluster=RUFLO

# 5) Full suite (agents + workflows)
node scripts/smoke-test/run.mjs all
```

Outputs land in `scripts/smoke-test/out/` as `smoke-<timestamp>.csv` +
`smoke-<timestamp>.md`. The markdown report auto-groups failures by
**root-cause pattern** so batch fixes are obvious.

## What it actually does

- **`inspect`** — pings `/api/agents/run`, `/healthz`, Supabase REST. One-shot sanity.
- **`agents`** — posts a minimal "who are you" prompt to every agent slug in
  `docs/04-agentes/identidades/`. Verifies the agent loads + Claude returns
  a non-empty response. Concurrency defaults to 6.
- **`workflows`** — lists all n8n workflows via REST API, fires the webhook
  for each active workflow that has a webhook trigger, polls `/api/v1/executions`
  until the run finishes, extracts error details per node. Concurrency 3.

## Required .env.local keys

```
INTERNAL_API_KEY           # POST /api/agents/run auth
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY  # Supabase REST probes
N8N_API_KEY                # n8n REST (optional, workflows only)
N8N_BASE_URL               # defaults to https://n8n-production-72be.up.railway.app
NEXT_PUBLIC_BASE_URL       # defaults to https://zero-risk-platform.vercel.app
```

Get a fresh n8n API key at: `https://n8n-production-72be.up.railway.app/settings/api`

## Failure pattern buckets (auto-classified)

The report groups failures into these buckets so fixes go batch-style:

| Bucket                    | Typical cause                                      | Fix strategy                        |
|---------------------------|----------------------------------------------------|-------------------------------------|
| `n8n_runner_timeout`      | Code node didn't get a task runner in time         | Runner infra fix (once)             |
| `n8n_expression_invalid`  | n8n template syntax error in a node                | Patch specific node via PUT         |
| `n8n_node_not_executed`   | Expression references a node that didn't run       | Move to Code node with try/catch    |
| `n8n_json_body_unescaped` | Markdown output broke JSON body                    | Wrap with JSON.stringify            |
| `n8n_jwt_invalid`         | API key signature failed after restart             | Regenerate key                      |
| `auth_unauthorized`       | x-api-key missing or wrong                         | Check header / INTERNAL_API_KEY     |
| `missing_route_or_resource` | 404 from Vercel or Supabase                      | Route not deployed / table missing  |
| `network_connection`      | DNS, connection refused, etc                       | Infra                               |
| `supabase_db_error`       | Supabase insert/select failed                      | Schema or RLS                       |
| `claude_rate_limit`       | Anthropic 429                                      | Reduce concurrency                  |
| `missing_credential`      | Credential not stored in n8n                       | Add via UI                          |
| `generic_timeout`         | Any other timeout                                  | Increase timeout or fix upstream    |

## Next steps after running

1. Paste the markdown report into this chat.
2. Claude classifies by pattern → proposes batch fix per pattern.
3. Apply batch fix (backend commit or `scripts/hardcode-env-vars.mjs`-style batch PUT).
4. Re-run the same smoke test to verify.
5. Iterate until PASS rate is green.
