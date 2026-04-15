# Tier 1 — Workflows Críticos (Sesión 19 cont.)

Cuatro workflows que cierran gaps críticos del plan Opción 4 vs el estado actual del platform. Todos listos para importar. Ver `docs/02-arquitectura/WORKFLOW_IMPLEMENTATION_MASTER.md` para rationale completo y scoring RUFLO.

| # | Archivo | Trigger | Pilar | Esfuerzo backend |
|---|---------|---------|-------|------------------|
| 1 | `lead-enrichment-scoring.json` | Webhook GHL | 3 | 2h (endpoint `/api/ghl/tag`) |
| 2 | `customer-health-score.json` | Cron 7am daily | 5 | 2h (migración + endpoint snapshot) |
| 3 | `closed-loop-attribution.json` | Cron 2am daily | 5 | 3h (migración + endpoint GHL opps) |
| 4 | `competitor-daily-monitor.json` | Cron 6am daily | 5 | 1h (endpoint snapshot) |

## Antes de importar

1. Correr migración Supabase (ver §7 del master doc):
   ```bash
   cd zero-risk-platform
   npx supabase db push  # aplica migrations/20260415_tier1.sql
   ```
2. Crear endpoints backend pendientes (ver master doc §7).
3. Configurar env vars nuevas en n8n Settings → Variables:
   - `APOLLO_API_KEY`, `HUNTER_API_KEY` (opcional fallback)
   - `INTERNAL_API_KEY` (para auth entre n8n y backend)
   - `SLACK_ALERTS_CHANNEL` (webhook dedicado para #alerts)
4. Importar JSONs en n8n Cloud: Workflows → Import from File.
5. Activar uno por uno y correr "Execute Workflow" con datos de prueba antes de dejar en producción.

## Orden recomendado

1. **Competitor Daily Monitor** primero — no requiere migración Supabase, solo endpoint snapshot.
2. **Closed-Loop Attribution** — requiere migración + endpoint GHL opportunities.
3. **Customer Health Score** — requiere migración + endpoint snapshot + GHL communications.
4. **Lead Enrichment & Scoring** — requiere cuenta Apollo.io ($49/mes) o Hunter.io, y endpoint `/api/ghl/tag`.

## Cost addition

Tier 1 añade ~$49-98/mes en SaaS externo (Apollo o Hunter). Apify/Serper/Firecrawl ya están pagados.
