# Ola 1 Deployment Guide — Orchestration Backbone

**6 workflows + 13 API routes + 8 Supabase tables. Estimated time: 45-60 min.**

This guide deploys Cluster 1 (Orchestration & Meta-Learning), which makes the post-audit Jefe de Marketing (NEXUS 7-phase) + RUFLO router + Optimization Agent (meta-agent feedback loop) + HITL Inbox Processor operational.

**Pre-staged in Session 27c:** SQL migration, 13 new Next.js API routes, URL updates to workflows. Everything lives in the repo — just deploy + configure credentials.

---

## Step 1 — Apply Supabase migration (5 min)

Open Supabase Dashboard → SQL Editor → New query. Paste the contents of:

```
zero-risk-platform/sql/cluster_1_orchestration.sql
```

(298 lines, idempotent with `CREATE TABLE IF NOT EXISTS`.)

Click **Run**. Expected: creates 8 tables + 1 trigger + 16 indexes + 8 RLS policies.

Verify with:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN (
  'campaign_pipeline_state', 'agent_routing_log', 'identity_improvement_queue',
  'phase_gate_audits', 'hitl_cycle_metrics', 'hitl_pending_approvals',
  'agent_outcomes', 'performance_metrics'
)
ORDER BY table_name;
```

Should return **8 rows**.

---

## Step 2 — Deploy API routes (auto via Vercel push, ~3 min)

All 13 new routes are already in `src/app/api/*`. Once you push the commit, Vercel auto-deploys. Routes:

| Route | Method | Purpose |
|---|---|---|
| `/api/campaign-pipeline/state` | POST, GET | NEXUS writes/reads phase state |
| `/api/evidence/validate` | POST | Phase Gate Evidence Collector — structural + semantic (calls editor-en-jefe agent) |
| `/api/phase-gate/audit` | POST, GET | Standalone audit record writer |
| `/api/hitl/approvals/create` | POST | Enqueue HITL item (V3 schema, parallel to legacy `/api/hitl/queue`) |
| `/api/hitl/approvals/pending` | GET | HITL Processor polls for pending items |
| `/api/hitl/approvals/expire` | POST | Marks item expired + optionally escalates |
| `/api/hitl/approvals/metrics` | POST | Cycle metrics for trend analysis |
| `/api/agent-routing/log` | POST | RUFLO logs every classification decision |
| `/api/analytics/agent-outcomes` | GET | Meta-Agent pulls last-N-days outcomes |
| `/api/analytics/performance-metrics` | GET | Meta-Agent pulls real-world KPIs |
| `/api/identity-improvements/queue` | POST, GET | Meta-Agent proposals + Emilio review list |
| `/api/agent-outcomes/write` | POST | Fire-and-forget outcome stream writer |
| `/api/client-brain/[client_id]` | GET | Lightweight client context fetch for RUFLO |

All use `checkInternalKey()` from `@/lib/internal-auth` (requires `x-api-key: $INTERNAL_API_KEY` header). Set `INTERNAL_API_KEY` in Vercel env if not already (ya existe en producción según Sesión 24).

**After pushing, wait ~2 min for Vercel deploy, then verify**:

```powershell
# From any terminal with the key:
curl -H "x-api-key: YOUR_INTERNAL_API_KEY" "https://zero-risk-platform.vercel.app/api/hitl/approvals/pending?limit=5"
# Should return: {"items":[],"count":0}
```

---

## Step 3 — Import 6 workflows to n8n (10 min)

n8n Cloud or self-hosted — for each workflow file in `n8n-workflows/proposed-sesion27b/01-orchestration/`:

1. Open n8n UI → **Workflows** → **Import from File**
2. Select:
   - `01-nexus-7phase-orchestrator.json`
   - `02-ruflo-smart-router.json`
   - `03-meta-agent-weekly-learning.json`
   - `04-hitl-inbox-processor.json`
   - `05-phase-gate-evidence-collector.json`
   - `06-agent-outcomes-stream-writer.json`
3. After each import: **do NOT activate yet** (no credentials configured). Just save.

---

## Step 4 — Configure n8n environment variables (5 min)

In n8n → **Settings** → **Variables** (or self-hosted: add to Railway env vars):

| Variable | Value |
|---|---|
| `ZERO_RISK_API_URL` | `https://zero-risk-platform.vercel.app` |
| `INTERNAL_API_KEY` | (same as Vercel env — copy from there) |
| `CLAUDE_API_KEY` | (same as Vercel — the `sk-ant-...` key) |
| `MC_BASE_URL` | `https://zero-risk-mission-control-production.up.railway.app` |
| `MC_API_TOKEN` | (from Vercel env) |
| `SLACK_WEBHOOK_URL` | (Slack incoming webhook — create if doesn't exist) |
| `POSTHOG_API_KEY` | (optional — for Agent Outcomes Writer analytics pipe) |

Also ensure credentials in n8n:
- **Anthropic HTTP Header Auth** (if not exists): header `x-api-key`, value from `$CLAUDE_API_KEY`
- **Internal API HTTP Header Auth**: header `x-api-key`, value from `$INTERNAL_API_KEY`

---

## Step 5 — Activate workflows (smoke test order, 10-15 min)

Activate in this order, testing each before next:

### 5.1 — Agent Outcomes Stream Writer (simplest, dependency-free)
1. Activate workflow.
2. Test: copy its webhook URL → POST a sample outcome:
   ```json
   {
     "agent_slug": "test-agent",
     "task_id": "smoke-test-1",
     "success": true,
     "tokens_used": 100,
     "latency_ms": 500
   }
   ```
3. Verify in Supabase: `SELECT * FROM agent_outcomes ORDER BY created_at DESC LIMIT 1;` → should show the test record.

### 5.2 — HITL Inbox Processor (cron every 15 min)
1. Activate workflow.
2. Manually trigger first execution (button in n8n UI).
3. Verify in Supabase: `SELECT * FROM hitl_cycle_metrics ORDER BY cycle_timestamp DESC LIMIT 1;` → 1 row created.

### 5.3 — Phase Gate Evidence Collector (webhook)
1. Activate.
2. Test webhook with sample phase_output:
   ```json
   {
     "request_id": "test-123",
     "phase": "STRATEGIZE",
     "phase_output": {"strategy": "test", "kpis": [1,2,3]},
     "success_criteria": ["strategy", "kpis"]
   }
   ```
3. Should return `{verdict: "PASS", ...}`.

### 5.4 — RUFLO Smart Router (webhook)
1. Activate.
2. Test with a sample task:
   ```json
   {
     "client_id": "zero-risk-ecuador",
     "request": "Crear una campaña de Meta Ads para el producto X",
     "source": "slack"
   }
   ```
3. Verify `agent_routing_log` gets a new row.

### 5.5 — NEXUS 7-Phase Campaign Orchestrator (webhook, the BIG one)
1. Activate.
2. Test with a sample campaign_brief (DRY RUN first — small budget, test client):
   ```json
   {
     "client_id": "zero-risk-ecuador",
     "campaign_brief": "Lanzar campaña piloto de leads para seguridad industrial sector construcción Quito",
     "priority": "medium"
   }
   ```
3. This triggers the full 7-phase pipeline — may take 5-15 min.
4. Monitor `campaign_pipeline_state` table and `phase_gate_audits` as it progresses.
5. On success: pipeline row has `current_phase = 'DONE'`, `status = 'completed'`.

### 5.6 — Meta-Agent Weekly Learning Cycle (cron Mondays 9am CET)
1. Activate.
2. Don't manually trigger yet — wait until you have ≥50 agent_outcomes rows (after ~1 week of activity).
3. When it runs: check `identity_improvement_queue` for proposals; Slack `#agency-ops` should get digest.

---

## Step 6 — Monitor first 24h

Things to watch:
- **Vercel logs** (Project → Logs): any 500 errors on new routes?
- **Supabase table counts**: `SELECT COUNT(*) FROM agent_outcomes` grows?
- **Slack alerts**: HITL items appear? NEXUS escalations?
- **Mission Control dashboard**: routing decisions visible?

---

## Rollback plan

If something breaks in production:

```powershell
# Rollback to pre-Ola-1 commit
git revert HEAD
git push origin main
```

Supabase tables are safe to keep (no writes break existing flows). n8n workflows: deactivate in UI (don't delete — reactivate later).

---

## What's NOT included in Ola 1 (future olas)

- Ola 2 workflows (Creative Fatigue, Cannibalization Audit, Paid Media v2): need separate DDL + routes.
- API routes for clusters 2-7: to be built when those olas activate.
- Credential setup for DataForSEO / Apify / Higgsfield / GHL / Meta Ads / Google Ads: part of FASE B (signups) + FASE E (n8n credentials) from SESSION_25_HANDOFF.

---

## Commit & push

Pre-staged files ready to commit (check with `git status`):

```powershell
git add sql/cluster_1_orchestration.sql \
        src/app/api/campaign-pipeline/ \
        src/app/api/evidence/ \
        src/app/api/phase-gate/ \
        src/app/api/hitl/approvals/ \
        src/app/api/agent-routing/ \
        src/app/api/analytics/agent-outcomes/ \
        src/app/api/analytics/performance-metrics/ \
        src/app/api/identity-improvements/ \
        src/app/api/agent-outcomes/ \
        src/app/api/client-brain/\[client_id\]/ \
        n8n-workflows/proposed-sesion27b/

git commit -m "feat(ola-1): orchestration backbone — 13 API routes + 8 Supabase tables + 6 unwrapped workflows"
git push origin main
```

Or use the all-inclusive single command:

```powershell
git add -A src/ sql/ n8n-workflows/
git commit -m "feat(ola-1): orchestration backbone — 13 API routes + Supabase DDL + 6 flat workflows"
git push origin main
```

---

Generated: Session 27c (autonomous pre-stage). Deploy checklist v1.
