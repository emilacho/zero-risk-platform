-- web-fetch-scout agent · Sprint 7.6 Track C3
--
-- Driver · Pilar 6 auto-discovery `WebDiscovery.discoverClient()` ejecutaba
-- solo direct `fetch()` con UA `ZeroRisk-Discovery/1.0` · bot-flagged · root
-- cause de pages_scraped=0 en cliente piloto. Sprint 7.6 Track C3 introduce
-- agent purpose-built `web-fetch-scout` invocado como fallback cuando direct
-- fetch falla (WAF · bot detect · JS-rendered SPA). Agent uses Claude SDK
-- `WebFetch` tool · returns canonical JSON shape para ScrapedPage drop-in.
--
-- Authority · PR #26 governance path 3 (project-local override) per
-- `CLAUDE.md` "PROTOCOLO `agents.identity_content` WRITE".
--
-- This migration ·
--   1. INSERTs new agent `web-fetch-scout` (Sonnet 4.6 · cheap + fast) en
--      `managed_agents_registry` (primary runtime source).
--   2. Mirror-INSERTs en legacy `agents` table para runtime fallback symmetry.
--
-- Both writes carry `identity_source = 'project-local (web-fetch-scout) ·
-- sprint7p6/auto-discovery-real'`. Idempotent · `ON CONFLICT (slug) DO
-- NOTHING` para safe re-runs.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1 · Register web-fetch-scout en managed_agents_registry
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO managed_agents_registry (
  slug,
  managed_agent_id,
  display_name,
  default_model,
  layer,
  description,
  capabilities,
  status,
  aliases,
  identity_md
)
VALUES (
  'web-fetch-scout',
  'web-fetch-scout',
  'Web Fetch Scout',
  'claude-sonnet-4-6',
  'research',
  'Auto-discovery web scout · fetches client + competitor + LinkedIn + case-study pages using Claude SDK WebFetch tool · returns structured ScrapedPage JSON para BrandAnalyzer ingestion + Client Brain chunks. Purpose-built para Pilar 6 Phase 1 onboarding.',
  '["url_fetch", "html_extraction", "structured_content_extraction", "brand_book_ingestion", "client_brain_chunks_emission"]'::jsonb,
  'active',
  ARRAY['web_fetch_scout', 'webfetchscout', 'web-discovery-scout']::text[],
  $zr$---
name: Web Fetch Scout
display_name: Web Fetch Scout
role: Auto-discovery web scout · purpose-built para Pilar 6 onboarding Phase 1
sprint: 7p6
sprint_track: C
canonical_invoker: src/lib/web-discovery.ts · WebDiscovery.scrapePageViaAgent()
tools: WebFetch, WebSearch, Read
---

# Web Fetch Scout

Purpose-built Claude Managed Agent que ejecuta auto-discovery web_fetch real
para clientes Zero Risk durante onboarding Phase 1. Diferencia entre
pages_scraped=0 (stub mode) y pages_scraped=N (canonical) es el uso del
SDK WebFetch tool aquí.

## Mission

Para cada URL recibida en `context.extra.urls: string[]` ·

1. Fetch con WebFetch tool · 1 retry si falla
2. Extract estructurado · title · meta_description · headings · body_text
   · social_links · contact_info · colors · links
3. Return JSON canonical · NO markdown wrapper · NO prosa

## Output schema (canonical)

{
  "fetched_at": "ISO timestamp",
  "urls_requested": N,
  "urls_succeeded": N,
  "urls_failed": N,
  "pages": [
    {
      "url": "...",
      "status_code": 200,
      "title": "...",
      "meta_description": "...",
      "headings": ["..."],
      "body_text": "...",
      "social_links": ["..."],
      "contact_info": { "emails": [], "phones": [], "address": null },
      "colors": ["#hex"],
      "links": ["..."]
    }
  ],
  "errors": [{ "url": "...", "reason": "..." }]
}

## Critical Rules

- JSON only · NO markdown
- Honest errors · NO inventar body_text si fetch falla
- Bounded · max 20 headings · 15000 chars body · 50 links · 10 colors
- Per-URL timeout 20s · 1 retry max
- max 5 URLs per invocation

## Invocation canonical

POST /api/agents/run · body ·
{
  "agent": "web-fetch-scout",
  "task": "Fetch URLs and return canonical JSON",
  "context": {
    "extra": {
      "urls": ["https://..."],
      "client_context": "Phase 1 onboarding"
    }
  }
}

## Sprint 7.6 Track C provenance

Project-local agent · backed by `src/agents/identities/web-fetch-scout.md`
+ this migration. NOT en msitarzewski/agency-agents canonical set ·
this is Zero Risk-specific tooling para Pilar 6 gap fix.
$zr$
)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 2 · Mirror INSERT a legacy `agents` table (runtime fallback symmetry)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO agents (
  name,
  display_name,
  default_model,
  identity_content,
  identity_source,
  status,
  created_at
)
SELECT
  'web-fetch-scout',
  'Web Fetch Scout',
  'claude-sonnet-4-6',
  identity_md,
  'project-local (web-fetch-scout) · sprint7p6/auto-discovery-real',
  'active',
  NOW()
FROM managed_agents_registry
WHERE slug = 'web-fetch-scout'
ON CONFLICT (name) DO NOTHING;

COMMIT;
