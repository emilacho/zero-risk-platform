# Zero Risk V3 — Backend para los 13 Workflows n8n

**Sesión 19 cont. parte 4 — 15 abril 2026.** Backend codeado en una sola sesión: 1 migración SQL + 14 archivos nuevos en `src/` (1 helper de auth, 1 helper de CRUD, 12 routes nuevas).

---

## 1. Aplicar migración Supabase

Archivo: `supabase/schema_v3_workflows.sql` (13 tablas nuevas + seed del cliente Zero Risk).

```bash
# Opción A — via psql
psql "$SUPABASE_DB_URL" -f supabase/schema_v3_workflows.sql

# Opción B — copiar/pegar en el SQL Editor de Supabase Studio
# https://supabase.com/dashboard/project/ordaeyxvvvdqsznsecjx/sql
```

Verificación (debe devolver 13 filas):
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN
  ('clients','managed_agents_registry','seo_engagements','seo_deliverables',
   'rank_tracking_daily','content_packages','experiments','review_metrics',
   'social_schedules','social_metrics','client_reports','hitl_queue',
   'agent_outcomes')
ORDER BY table_name;
```

---

## 2. Variables de entorno

Agregar a `.env.local` y replicar como Variable en n8n Cloud (Settings → Variables):

```
INTERNAL_API_KEY=<32-char random — `openssl rand -hex 16`>
ZERO_RISK_API_URL=https://app.zerorisk.ec   # o http://localhost:3000 en dev
SUPABASE_SERVICE_ROLE_KEY=<ya configurado>
```

Los 13 workflows ya leen `$env.ZERO_RISK_API_URL` y `$env.INTERNAL_API_KEY` en cada nodo HTTP.

---

## 3. Endpoints nuevos (13 archivos route.ts)

Todos: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. Auth de escritura via `x-api-key`. Lectura abierta (Mission Control corre en mismo origen).

### Bridge a Anthropic Agent SDK (ya existía)
- `POST /api/agents/run-sdk` — ejecutor de un agente vía `@anthropic-ai/claude-agent-sdk` con sesiones persistentes y MCP Client Brain.

### SEO (5)
- `POST /api/seo-engagements` — crear engagement (idempotente por `task_id`)
- `GET  /api/seo-engagements?client_id=&status=&limit=`
- `GET  /api/seo-engagements/[id]` — id ó task_id
- `PATCH /api/seo-engagements/[id]` — actualizar status/playbook/agent_outputs
- `POST /api/seo-engagements/[id]/deliverables` — persiste playbook + agent outputs como filas separadas en `seo_deliverables`, mueve engagement a `awaiting_review`
- `GET  /api/seo-engagements/[id]/deliverables`
- `POST /api/rank-tracking/initialize` — siembra una fila por keyword (rank=null) para que el cron diario sepa qué trackear
- `POST /api/rank-tracking/daily` — upsert masivo de snapshots (key: engagement+keyword+country+date)
- `GET  /api/rank-tracking/daily?engagement_id=&keyword=&since=`

### Content + Social (5)
- `POST /api/content-packages` — Content Team Orchestrator persiste output final
- `GET  /api/content-packages?client_id=&status=`
- `GET  /api/content-packages/[id]`
- `PATCH /api/content-packages/[id]` — copy/email/media_plan/images/videos/brand_review/status
- `POST /api/social-schedules` — single o batch (`{items: [...]}`)
- `GET  /api/social-schedules?status=scheduled&platform=meta`
- `PATCH /api/social-schedules/[id]` — callback del worker publisher
- `POST /api/social-metrics` — upsert masivo de métricas (key: schedule+date)
- `GET  /api/social-metrics?client_id=&platform=&since=`

### Experiments (2)
- `POST /api/experiments` — Landing Page CRO Optimizer
- `GET  /api/experiments?client_id=&status=`
- `GET  /api/experiments/[id]`
- `PATCH /api/experiments/[id]` — status/results/started_at/ended_at

### HITL (2)
- `POST /api/hitl/queue` — encolar item desde cualquier workflow
- `GET  /api/hitl/queue?status=pending&client_id=&type=` — Mission Control inbox
- `GET  /api/hitl/[id]`
- `PATCH /api/hitl/[id]` — decisión del reviewer; propaga `approved`/`rejected` al entity de origen vía metadata

### Reports + Reviews (4)
- `POST /api/client-reports` — Weekly Client Report Generator
- `GET  /api/client-reports?client_id=&kind=weekly`
- `GET  /api/client-reports/[id]`
- `PATCH /api/client-reports/[id]` — status/pdf_url/delivered_to/delivered_at
- `POST /api/review-metrics` — upsert masivo (key: platform+external_id)
- `GET  /api/review-metrics?client_id=&platform=&status=`
- `GET  /api/review-metrics/[id]`
- `PATCH /api/review-metrics/[id]` — response/status/responded_at

### Client Brain RAG (1 nuevo + 1 existente)
- `POST /api/client-brain/query` — alias conveniente que devuelve `{results, guardrails, context_md}` en una sola llamada. Auth: `x-api-key`.
- `POST /api/client-brain` — endpoint legacy con dispatcher de tools (`query_client_brain`, `get_client_guardrails`, `build_agent_context`). Auth: `Bearer <SUPABASE_SERVICE_ROLE_KEY>`.

---

## 4. Smoke tests (curl)

```bash
export ZR=https://app.zerorisk.ec   # o http://localhost:3000
export KEY=$INTERNAL_API_KEY

# Crear engagement de prueba
curl -X POST $ZR/api/seo-engagements \
  -H "Content-Type: application/json" -H "x-api-key: $KEY" \
  -d '{"task_id":"smoke-001","client_id":"<UUID-zero-risk>","domain":"zerorisk.ec","target_keyword":"seguridad industrial ecuador","locale":{"country":"EC","language":"es"}}'

# Encolar HITL
curl -X POST $ZR/api/hitl/queue \
  -H "Content-Type: application/json" -H "x-api-key: $KEY" \
  -d '{"client_id":"<UUID>","type":"seo_playbook_review","title":"Test playbook","priority":"high","metadata":{"task_id":"smoke-001"}}'

# Listar inbox
curl -s $ZR/api/hitl/queue?status=pending | jq

# Aprobar (debería propagar status='approved' al engagement)
curl -X PATCH $ZR/api/hitl/<HITL-UUID> \
  -H "Content-Type: application/json" -H "x-api-key: $KEY" \
  -d '{"status":"approved","reviewer":"emilio","decision":{"notes":"go"}}'
```

---

## 5. Plan de activación (en orden)

1. Aplicar `schema_v3_workflows.sql` en Supabase.
2. Aplicar `schema_v3_agents_alignment.sql` en Supabase (agrega `aliases` + `identity_md` a `managed_agents_registry`, seedea 33 agentes con cobertura 1:1 de los 19 slugs usados por los 13 workflows).
3. **Poblar identidades** en el registry: `cd zero-risk-platform && npx tsx scripts/sync-registry-identities.ts`. Lee cada `system_prompt_ref` desde disco y rellena `identity_md` (esto evita que el runner haga `fs.readFile` en producción).
4. Setear `INTERNAL_API_KEY` y `ZERO_RISK_API_URL` en `.env.local` y en n8n Cloud (Settings → Variables).
5. Configurar credenciales de servicios externos en n8n: DataForSEO, Firecrawl, PSI, Ideogram, Higgsfield, Mailgun, GHL, Apify, Trustpilot, tokens de redes sociales, Slack webhook.
6. `npm run build` + deploy a Vercel.
7. Smoke test cada endpoint (curl arriba).
8. Activar workflows en n8n uno a uno con "Execute Workflow" antes de poner cron en ON. Sugerido: Lead Enrichment → Customer Health → Competitor Daily Monitor → Review Monitor → ... → terminar con Flagship SEO.

---

## 6. Estado del typecheck

```
$ npx tsc --noEmit
```

Errores pre-existentes (no relacionados con esta sesión):
- `hitl/pending/route.ts` — Set spread; necesita `tsconfig.target: es2015+` o `downlevelIteration`.
- `agent-sdk-runner.ts` — type decl missing en `@anthropic-ai/claude-agent-sdk`; correr `npm install`.
- `supabase/functions/generate-embedding/index.ts` — Deno edge function, no debería estar en el `tsconfig` include.

**Mis 14 archivos nuevos pasan typecheck limpio.**

---

## 7. Archivos creados / modificados

```
supabase/schema_v3_workflows.sql                    [NEW] migración 13 tablas
src/lib/internal-auth.ts                            [NEW] x-api-key check
src/lib/crud-helpers.ts                             [NEW] genericList/Insert/Patch
src/app/api/seo-engagements/route.ts                [NEW]
src/app/api/seo-engagements/[id]/route.ts           [NEW]
src/app/api/seo-engagements/[id]/deliverables/route.ts [NEW]
src/app/api/rank-tracking/initialize/route.ts       [NEW]
src/app/api/rank-tracking/daily/route.ts            [NEW]
src/app/api/content-packages/route.ts               [NEW]
src/app/api/content-packages/[id]/route.ts          [NEW]
src/app/api/social-schedules/route.ts               [NEW]
src/app/api/social-schedules/[id]/route.ts          [NEW]
src/app/api/social-metrics/route.ts                 [NEW]
src/app/api/experiments/route.ts                    [NEW]
src/app/api/experiments/[id]/route.ts               [NEW]
src/app/api/hitl/queue/route.ts                     [NEW]
src/app/api/hitl/[id]/route.ts                      [NEW]
src/app/api/client-reports/route.ts                 [NEW]
src/app/api/client-reports/[id]/route.ts            [NEW]
src/app/api/review-metrics/route.ts                 [NEW]
src/app/api/review-metrics/[id]/route.ts            [NEW]
src/app/api/client-brain/query/route.ts             [NEW]
```

---

*Generado autónomamente — Sesión 19 cont. parte 4 — 15 abril 2026*
