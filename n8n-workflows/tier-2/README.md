# Tier 2 — Multi-Agent Workflows (Sesión 19 cont.)

Siete workflows de segunda capa que orquestan múltiples sub-agentes Claude para cubrir los pilares de creación, optimización, inteligencia competitiva, reputación, email, social y reporting. Cada uno sigue el mismo patrón: validación → datos paralelos → sub-agentes Claude en paralelo (con modelo óptimo por tarea: Haiku/Sonnet/Opus) → síntesis → persistencia → HITL → respuesta.

| # | Archivo | Trigger | Sub-agentes | Pilar | Costo/run |
|---|---------|---------|-------------|-------|-----------|
| 1 | `content-team-orchestrator.json` | Webhook | 6 (Brief, Creator, Copy, Email, Media, Brand) | 3 | ~$3-5 |
| 2 | `meta-ads-full-stack-optimizer.json` | Cron 3am | 1 (Meta Agent Sonnet) | 5 | ~$0.50/cliente |
| 3 | `landing-page-cro-optimizer.json` | Webhook | 1 (CRO Strategist) | 3 | ~$1-2 |
| 4 | `competitive-intelligence-5layer.json` | Webhook | 1 (Competitive Strategist Opus) | 5 | ~$2-4 |
| 5 | `review-monitor-response.json` | Cron 8am | 1 (Review Responder Haiku) | 5 | ~$0.10/cliente |
| 6 | `email-campaign-orchestrator.json` | Webhook | 1 (Email Marketer Sonnet) | 3 | ~$1-2 |
| 7 | `social-multi-platform-publisher.json` | Webhook | 1 (Social Adapter Sonnet) | 3 | ~$0.80 |
| 8 | `weekly-client-report-generator.json` | Cron Mon 9am | 1 (Client Analyst Sonnet) | 5 | ~$1/cliente |

## Dependencias backend adicionales

Además de lo ya requerido por Tier 1, Tier 2 necesita los siguientes endpoints:

- `POST /api/content-packages` — persist
- `POST /api/meta-ads/apply-optimization` — dry-run + HITL gate
- `GET /api/meta-ads/campaigns` — filtered by status
- `POST /api/stitch/generate-variants` — Google Stitch + 21st.dev wrapper
- `POST /api/growthbook/experiments` — A/B/n launcher
- `GET /api/clarity/session-stats` — Microsoft Clarity pull
- `POST /api/competitors/deep-report` — CI deep synthesis persist
- `POST /api/reviews/auto-respond` — platform API router
- `POST /api/reviews/persist` — review metric store
- `GET /api/reviews/weekly-summary` — aggregate for reports
- `POST /api/social/schedule-batch` — multi-platform scheduler
- `GET /api/social/weekly-metrics` — aggregate for reports
- `POST /api/reports/render-pdf` — Puppeteer PDF renderer
- `POST /api/reports/publish-notion` — Notion API
- `POST /api/reports/persist`
- `GET /api/ghl/summary` — GHL dashboard aggregate

## Variables de entorno nuevas

```
META_ACCESS_TOKEN=
LINKEDIN_ACCESS_TOKEN=
X_BEARER_TOKEN=
TIKTOK_ACCESS_TOKEN=
THREADS_ACCESS_TOKEN=
GOOGLE_ACCESS_TOKEN=       # OAuth refresh-token flow
GOOGLE_PSI_KEY=            # PageSpeed Insights
TRUSTPILOT_API_KEY=
IDEOGRAM_API_KEY=
HIGGSFIELD_API_KEY=
GHL_ACCESS_TOKEN=
GHL_LOCATION_ID=
MAILGUN_DOMAIN=
MAILGUN_API_KEY=           # basic auth
DATAFORSEO_AUTH=           # base64 user:pass
APIFY_TOKEN=               # shared w/ Tier 1
FIRECRAWL_API_KEY=         # shared
SERPER_API_KEY=            # shared
```

## Orden recomendado de importación

1. `review-monitor-response.json` — standalone, pruebas rápidas
2. `weekly-client-report-generator.json` — agregador, depende de varios endpoints
3. `meta-ads-full-stack-optimizer.json` — gated por HITL, seguro
4. `competitive-intelligence-5layer.json` — único gran gasto es Apify/DataForSEO
5. `landing-page-cro-optimizer.json` — requiere GrowthBook + Stitch wrappers
6. `content-team-orchestrator.json` — mayor consumo; importar al final
7. `email-campaign-orchestrator.json` — requiere GHL + Mailgun configurados
8. `social-multi-platform-publisher.json` — requiere 5 tokens de plataformas

## Modelo de costos (5 clientes activos, mes promedio)

| Concepto | Costo/mes |
|---------|-----------|
| Meta Ads optimizer (daily) | ~$75 |
| Review monitor (daily) | ~$15 |
| Weekly reports (5×4 weeks) | ~$20 |
| Competitor daily (Tier 1) | ~$30 |
| On-demand (CRO, Content, Email, Social, CI) | ~$40-80 |
| **Total Claude compute** | **~$180-220/mes** |
| Apify + DataForSEO + Firecrawl + PSI | ~$100-150/mes |
| **Total SaaS externos** | **~$280-370/mes** |

Con 5 clientes a ticket promedio $2,500/mes = $12,500 MRR, margen operativo > 97%.
