# Flagship — SEO Rank-to-#1 (single-prompt to automated #1 ranking)

El workflow insignia de Zero Risk. Un solo POST al webhook con `{ client_id, domain, primary_keyword, locale, competitors[] }` dispara un plan completo de 90 días para llevar al cliente al top de Google (y a las AI Overviews / GEO).

## Arquitectura

```
Webhook → Validate → Persist Engagement Start
  → Client Brain RAG (k=20)
  → Parallel data collection (7 branches):
      · DataForSEO SERP live (w/ AI Overview + People Also Ask depth 4)
      · DataForSEO Keyword Volume + CPC
      · Backlink profile (client + top 5 competitors)
      · Firecrawl Full Site Crawl (500 pages)
      · PageSpeed Insights Mobile
      · PageSpeed Insights Desktop
      · Mobile-Friendly Test
  → Aggregate Raw Data (extract SERP features: top10, featured_snippet, ai_overview_refs, PAA, local_pack, related_searches; CWV LCP/INP/CLS; backlinks summary; tech audit)
  → Parallel sub-agents (5):
      · Competitive Intelligence (Sonnet) — depth matrix, gaps, backlink targets
      · Content Strategist (Sonnet) — pillar + 12-18 spokes + cluster map + E-E-A-T plan + entities
      · Technical SEO (Haiku) — issue list, CWV plan, JSON-LD schema package, internal link audit, sitemap/robots GPTBot/ClaudeBot/PerplexityBot
      · GEO Optimization (Haiku) — llms.txt, fact density, citation-worthy blocks, structured data density, brand SERP
      · Backlink Strategist (Sonnet) — 50 ranked prospects, 4 outreach templates, PR ideas, internal boost, anchor distribution
  → Merge Outputs → Orchestrator (Opus Synthesis):
      · 90-day playbook with week-by-week 12-week calendar
      · KPI dashboard (projected monthly impressions/clicks/leads/revenue)
      · Risks + budget + critical path
  → Parallel outputs:
      · Persist Deliverables
      · Initialize Rank Tracking (daily, tracks featured_snippet / ai_overview / PAA / local_pack / image_pack / video_carousel)
      · Queue HITL Review
  → Slack Notify → Respond Webhook
```

## Costo esperado

- **Arranque (una vez):** $9-14 por engagement (DataForSEO + PSI + Firecrawl + Claude multi-agent)
- **Monitoreo continuo:** ~$1.80/mes por cliente (rank tracking diario + ocasional re-crawl)

## Tiempo esperado

~25 minutos end-to-end (la sintetización Opus es el cuello de botella).

## Deliverables que produce

1. SERP feature map actual (top 10 orgánico + AI Overview references + PAA + local pack + related searches)
2. Content cluster map (1 pillar + 12-18 spokes) listo para pasar al Content Team Orchestrator
3. Technical audit con fixes priorizados + JSON-LD schema package
4. GEO package (llms.txt, fact density blocks, citation blocks)
5. Backlink prospect list de 50 nombres ranked + templates outreach
6. Playbook 90 días con calendario semana-a-semana
7. KPI dashboard con proyecciones

## Integración con el resto del stack

- `content-team-orchestrator.json` consume el cluster map para producir los blogs.
- `meta-ads-full-stack-optimizer.json` recibe las keyword-intent insights para campañas de soporte pagadas.
- `weekly-client-report-generator.json` incluye el rank-tracking delta semanal.

## Endpoints backend requeridos

- `POST /api/seo-engagements` — registrar inicio
- `POST /api/client-brain/rag-search` — shared
- `POST /api/agents/run-sdk` — shared multi-model
- `POST /api/seo/persist-deliverables`
- `POST /api/seo/rank-tracking/initialize` — crea daily job
- `POST /api/hitl/queue` — shared

## Variables de entorno

```
DATAFORSEO_AUTH=
FIRECRAWL_API_KEY=
GOOGLE_PSI_KEY=
INTERNAL_API_KEY=
SLACK_WEBHOOK_URL=
ZERO_RISK_API_URL=
```

## ¿Por qué "rank-to-#1"?

El workflow combina los 3 vectores que Google pondera en 2026:
1. **Contenido (E-E-A-T + topical authority):** cluster map con pillar + spokes + entidades + fact density.
2. **Technical + CWV:** audit + schema + sitemap/robots optimizados para crawlers tradicionales Y crawlers IA (GPTBot, ClaudeBot, PerplexityBot).
3. **Backlinks + brand:** 50 prospectos ranked + templates + PR ideas + anchor distribution.

Y además optimiza para **GEO (Generative Engine Optimization)** — el nuevo campo de batalla: aparecer en AI Overviews, ChatGPT search, Perplexity, Claude citations. El sub-agente GEO produce `llms.txt`, bloques de fact density y citation-worthy content que los LLMs prefieren referenciar.

Ningún competidor de agencia actualmente orquesta los 4 frentes (SEO tradicional + CWV + Backlinks + GEO) en un solo prompt automatizado. Este es el **moat técnico** de Zero Risk.
