# Zero Risk — n8n Workflows

Workflows de orquestación mecánica. Importar en n8n Cloud (Workflows → Import from File) o Starter.

## Inventario (10 workflows)

| # | Archivo | Trigger | Pilar | Propósito |
|---|---------|---------|-------|-----------|
| 1 | `lead-to-pipeline.json` | Webhook GHL | 3 | Nuevo lead → dispara pipeline 9 pasos |
| 2 | `pipeline-delay-resume.json` | Cron hourly | 3 | Reanuda pipelines tras delay de optimización |
| 3 | `meta-agent-weekly-cron.json` | Cron lunes 9am | 5 | Meta-agente analiza outcomes y propone mejoras |
| 4 | `hitl-pause-reminder.json` | Cron cada 2h | 4 | Ping a Slack si hay HITL aprobaciones >4h viejas |
| 5 | `daily-ops-digest.json` | Cron diario 9am | Obs | Digest matutino a Slack (pipelines, costos, queue) |
| 6 | `failed-pipeline-escalation.json` | Cron cada 15min | 4 | Alerta + log MC cuando un pipeline falla |
| 7 | `campaign-metrics-collector.json` | Cron diario 23:00 | 5 | Recolecta métricas de campañas activas (Meta/GA/Mailgun/GHL) |
| 8 | `onboarding-new-client.json` | Webhook | 6 | Nuevo cliente → trigger orchestrator onboarding |
| 9 | `content-publisher-router.json` | Webhook | 3 | Contenido aprobado → ruta a canal correcto (Meta/Email/GHL/Landing) |
| 10 | `cost-watchdog.json` | Cron hourly | Obs | Alerta si costos diarios exceden caps (global o por cliente) |

---

## Detalle por workflow

### 1. `lead-to-pipeline.json` — Pilar 3

GoHighLevel envía webhook cuando entra un nuevo lead. n8n dispara el pipeline completo de 9 pasos, notifica en Slack y responde a GHL con el `pipeline_id`.

- **Webhook path:** `/webhook/zero-risk/new-lead`
- **Config GHL:** Settings → Webhooks → Add → `Contact Created`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`, `DEFAULT_CLIENT_ID`

---

### 2. `pipeline-delay-resume.json` — Pilar 3

Cada hora revisa pipelines pausados por delay (ej: Step 8 Optimization espera 48h). Si el delay venció, el endpoint `/api/pipeline/resume-delayed` marca el step completo y reanuda.

- **Cron:** `0 * * * *`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`

---

### 3. `meta-agent-weekly-cron.json` — Pilar 5

Cada lunes 9am dispara el meta-agente. Analiza outcomes de la última semana con Sonnet, detecta patrones y genera propuestas de mejora que aparecen en Inbox HITL → "Mejoras Agentes".

- **Cron:** `0 9 * * 1`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`, `MC_API_KEY`

---

### 4. `hitl-pause-reminder.json` — Pilar 4 🆕

Cada 2 horas consulta `/api/hitl/pending` y filtra aprobaciones con >4h de antigüedad. Si hay, envía ping a Slack con contador y link al inbox.

- **Cron:** `0 */2 * * *`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`

---

### 5. `daily-ops-digest.json` — Observabilidad 🆕

Cada día a las 9am compone un digest a Slack con: pipelines completados/fallados de ayer, coste total USD, promedio de pasos, top agent, y HITL queue size. Fetch en paralelo de `/api/analytics/performance?days=1` y `/api/hitl/pending`, merge y formateo.

- **Cron:** `0 9 * * *`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`

---

### 6. `failed-pipeline-escalation.json` — Pilar 4 🆕

Cada 15 minutos consulta `/api/pipeline/status?status=failed&since=15m&escalated=false`. Si hay fallas nuevas, envía alerta a Slack con los IDs y errores, luego registra el evento en Mission Control.

- **Cron:** `*/15 * * * *`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`, `MC_API_KEY`

**Nota backend:** el endpoint `/api/pipeline/status` debe aceptar los query params `status`, `since` y `escalated` — verificar implementación y añadir filtros si hace falta.

---

### 7. `campaign-metrics-collector.json` — Pilar 5 🆕

Diario a las 23:00 consulta `/api/campaigns?status=active`, itera por cada campaña y llama `/api/analytics/campaign-results` pidiendo recolectar de `meta_ads`, `google_ads`, `mailgun` y `ghl`. Cierra con resumen a Slack (OK vs fallos).

- **Cron:** `0 23 * * *`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`

**Nota backend:** el endpoint POST `/api/analytics/campaign-results` debe aceptar `{campaign_id, client_id, collect_sources, date}` y devolver `{success: bool}`.

---

### 8. `onboarding-new-client.json` — Pilar 6 🆕

Webhook que recibe `{name, website, industry, email?, phone?, source?}` y dispara el onboarding orchestrator (auto-discovery del brand book) via `/api/onboarding`. Notifica en Slack y responde con `onboarding_id`.

- **Webhook path:** `/webhook/zero-risk/onboard-client`
- **Uso:** formularios web, CRM, o llamada directa desde Mission Control.

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`

---

### 9. `content-publisher-router.json` — Pilar 3 🆕

Webhook que recibe contenido aprobado y lo enruta al canal correcto:

- `channel: "meta_ads"` → `/api/content/publish/meta-ads`
- `channel: "email"` → `/api/content/publish/email`
- `channel: "ghl_post"` → `/api/content/publish/ghl`
- `channel: "landing_page"` → `/api/content/publish/landing`

Uso típico: cuando Emilio aprueba contenido en el Inbox HITL, el dashboard dispara este webhook con el payload.

- **Webhook path:** `/webhook/zero-risk/publish-content`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`, `INTERNAL_API_KEY`

**Nota backend:** faltan los 4 endpoints `/api/content/publish/*` — son los conectores a Meta Ads API (Facebook Developers), Mailgun, GoHighLevel, y un endpoint propio para landing pages.

---

### 10. `cost-watchdog.json` — Observabilidad 🆕

Cada hora consulta el gasto del día vía `/api/analytics/performance?days=1&group_by=client`. Si supera `DAILY_CAP_USD` global (default $50) o `PER_CLIENT_CAP_USD` (default $20), alerta Slack y registra en Mission Control. Previene runaways.

- **Cron:** `0 * * * *`

**Env vars:** `ZERO_RISK_API_URL`, `SLACK_WEBHOOK_URL`, `MC_API_KEY`, `DAILY_CAP_USD`, `PER_CLIENT_CAP_USD`

**Nota backend:** el endpoint `/api/analytics/performance` debe soportar `group_by=client` y devolver `{total_cost_usd, by_client: [{client_id, name, cost_usd}...]}`.

---

## Importar en n8n (batch)

1. Abrir n8n Cloud → Workflows → Import from File.
2. Seleccionar los 10 .json en secuencia (o uno a uno).
3. Al importar, configurar las variables de entorno globales en `Settings → Variables`:
   ```
   ZERO_RISK_API_URL=https://tu-app.vercel.app  (o localhost:3000 en dev)
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
   DEFAULT_CLIENT_ID=<uuid>
   MC_API_KEY=<key>
   INTERNAL_API_KEY=<key>
   DAILY_CAP_USD=50
   PER_CLIENT_CAP_USD=20
   ```
4. Activar cada workflow (toggle en la esquina superior derecha).
5. Para webhooks: copiar la "Production URL" y configurarla donde corresponda (GHL, Mission Control, etc.).

## Arquitectura: n8n = trabajo mecánico

n8n NO maneja inteligencia. Solo orquesta:

- **Crons** (digest, watchdog, meta-agente, delay resume).
- **Webhooks** (leads, onboarding, publishing).
- **Routing** (content → canal correcto).
- **Alerting** (Slack + Mission Control logs).

La inteligencia vive en Claude Managed Agents (Capa 1, vía Agent SDK — ver `docs/02-arquitectura/REFACTOR_AGENT_SDK.md`). n8n es Capa 2.

## Pendiente (backend)

Estos endpoints están referenciados desde los workflows pero pueden faltar en `src/app/api/`:

- `/api/content/publish/meta-ads` — POST
- `/api/content/publish/email` — POST
- `/api/content/publish/ghl` — POST
- `/api/content/publish/landing` — POST
- `/api/pipeline/status?status=&since=&escalated=` — GET con filtros
- `/api/analytics/performance?days=&group_by=` — GET con `group_by=client`
- `/api/analytics/campaign-results` — POST para invocar el collector
- `/api/campaigns?status=active` — GET

Revisar y/o añadir según necesidad antes de activar los workflows correspondientes.
