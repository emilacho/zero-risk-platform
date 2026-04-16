-- ============================================================================
-- Zero Risk V3 — Agent Registry Alignment (Sesión 19 cont. parte 5)
--
-- Adds:
--   1. aliases TEXT[] column on managed_agents_registry
--   2. resolve_agent_slug(text) helper function — returns canonical slug
--      given either a canonical slug or any alias
--   3. seed of 33 active agents (27 originals + 5 SEO sub-agents + 1 review responder)
--      with the alias coverage required by the 13 imported n8n workflows
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Schema change ---------------------------------------------------------

ALTER TABLE managed_agents_registry
  ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';

ALTER TABLE managed_agents_registry
  ADD COLUMN IF NOT EXISTS identity_md TEXT;
  -- Populated post-migration by `npx tsx scripts/sync-registry-identities.ts`,
  -- which reads each row's system_prompt_ref from disk. This makes the runner
  -- production-safe (no fs.readFile in the request path on Vercel).

CREATE INDEX IF NOT EXISTS idx_mar_aliases
  ON managed_agents_registry USING GIN (aliases);

-- 2. Resolver function -----------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_agent_slug(p_input TEXT)
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT slug
  FROM managed_agents_registry
  WHERE status = 'active'
    AND (slug = p_input OR p_input = ANY(aliases))
  LIMIT 1
$$;

-- 3. Seed registry ---------------------------------------------------------
-- managed_agent_id is set to the slug for now; will be replaced by the real
-- Anthropic Managed Agent ID once each agent is registered with the API.

-- Wipe and reload deterministically so re-running keeps state clean.
TRUNCATE managed_agents_registry RESTART IDENTITY;

INSERT INTO managed_agents_registry
  (slug, managed_agent_id, display_name, default_model, layer, description, system_prompt_ref, aliases, status)
VALUES
  -- ---------------- Transversales (2) ----------------
  ('ruflo', 'ruflo', 'RUFLO — Pre-procesador',
   'claude-haiku-4-5', 'transversal',
   'Clasificador y pre-procesador. Todo prompt pasa por aquí primero.',
   'docs/04-agentes/identidades/ruflo.md',
   ARRAY[]::text[], 'active'),

  ('editor-en-jefe', 'editor-en-jefe', 'Editor en Jefe (QA)',
   'claude-sonnet-4-6', 'transversal',
   'QA editorial — último filtro antes de publicar.',
   'docs/04-agentes/identidades/editor-en-jefe.md',
   ARRAY[]::text[], 'active'),

  -- ---------------- Coordinadores (2) ----------------
  ('jefe-marketing', 'jefe-marketing', 'Jefe de Marketing',
   'claude-sonnet-4-6', 'orchestration',
   'Coordinador del Dept. Marketing. Descompone, asigna, consolida.',
   'docs/04-agentes/identidades/jefe-marketing.md',
   ARRAY['orchestrator']::text[], 'active'),

  ('jefe-client-success', 'jefe-client-success', 'Jefe de Client Success',
   'claude-sonnet-4-6', 'orchestration',
   'Coordinador del Dept. Client Success.',
   'docs/04-agentes/identidades/jefe-client-success.md',
   ARRAY[]::text[], 'active'),

  -- ---------------- Marketing — Planning (5) ----------------
  ('campaign-brief-agent', 'campaign-brief-agent', 'Campaign Brief Agent',
   'claude-sonnet-4-6', 'marketing-planning',
   'Construye briefs estructurados a partir de objetivos de alto nivel.',
   'docs/04-agentes/identidades/campaign-brief-agent.md',
   ARRAY['campaign_brief']::text[], 'active'),

  ('brand-strategist', 'brand-strategist', 'Brand Strategist',
   'claude-opus-4-6', 'marketing-planning',
   'Positioning, brand voice, messaging framework.',
   'docs/04-agentes/identidades/brand-strategist.md',
   ARRAY['brand_strategist']::text[], 'active'),

  ('market-research', 'market-research', 'Market Research',
   'claude-sonnet-4-6', 'marketing-planning',
   'ICP, market sizing, competitive landscape, trends.',
   'docs/04-agentes/identidades/market-research.md',
   ARRAY[]::text[], 'active'),

  ('customer-research', 'customer-research', 'Customer Research',
   'claude-sonnet-4-6', 'marketing-planning',
   'Voice-of-Customer, NPS analysis, interview synthesis.',
   'docs/04-agentes/identidades/customer-research.md',
   ARRAY[]::text[], 'active'),

  ('competitive-intelligence-agent', 'competitive-intelligence-agent',
   'Competitive Intelligence Agent',
   'claude-opus-4-6', 'marketing-planning',
   'Inteligencia competitiva 5 capas: ads, SEO, landing, social, trends.',
   'docs/04-agentes/identidades/competitive-intelligence-agent.md',
   ARRAY['competitive_intelligence', 'competitive_strategist']::text[], 'active'),

  -- ---------------- Marketing — Creation (7) ----------------
  ('content-creator', 'content-creator', 'Content Creator',
   'claude-sonnet-4-6', 'marketing-creation',
   'Long-form content (blogs, articles, landing copy).',
   'docs/04-agentes/identidades/content-creator.md',
   ARRAY['copywriter', 'content_creator']::text[], 'active'),

  ('seo-specialist', 'seo-specialist', 'SEO Specialist',
   'claude-sonnet-4-6', 'marketing-creation',
   'Coordinador SEO. Para sub-tareas usa los 5 sub-agentes SEO.',
   'docs/04-agentes/identidades/seo-specialist.md',
   ARRAY[]::text[], 'active'),

  ('media-buyer', 'media-buyer', 'Media Buyer',
   'claude-sonnet-4-6', 'marketing-creation',
   'Paid ads strategy: Meta, Google, LinkedIn, TikTok.',
   'docs/04-agentes/identidades/media-buyer.md',
   ARRAY['media_buyer']::text[], 'active'),

  ('web-designer', 'web-designer', 'Web Designer',
   'claude-sonnet-4-6', 'marketing-creation',
   'Diseño visual de landing pages nuevas (Stitch + 21st.dev).',
   'docs/04-agentes/identidades/web-designer.md',
   ARRAY[]::text[], 'active'),

  ('video-editor', 'video-editor', 'Video Editor',
   'claude-sonnet-4-6', 'marketing-creation',
   'Edición de video, motion graphics, subtitulado.',
   'docs/04-agentes/identidades/video-editor.md',
   ARRAY[]::text[], 'active'),

  ('creative-director', 'creative-director', 'Creative Director',
   'claude-sonnet-4-6', 'marketing-creation',
   'Generación de assets visuales con Ideogram + Higgsfield.',
   'docs/04-agentes/identidades/creative-director.md',
   ARRAY[]::text[], 'active'),

  ('social-media-strategist', 'social-media-strategist',
   'Social Media Strategist',
   'claude-sonnet-4-6', 'marketing-creation',
   'Define plan editorial social y adapta contenido por plataforma.',
   'docs/04-agentes/identidades/social-media-strategist.md',
   ARRAY['social_adapter']::text[], 'active'),

  -- ---------------- Marketing — Activation (4) ----------------
  ('community-manager', 'community-manager', 'Community Manager',
   'claude-haiku-4-5', 'marketing-activation',
   'DMs y comentarios en redes en tiempo real.',
   'docs/04-agentes/identidades/community-manager.md',
   ARRAY[]::text[], 'active'),

  ('influencer-manager', 'influencer-manager', 'Influencer Manager',
   'claude-sonnet-4-6', 'marketing-activation',
   'Discovery, outreach y tracking de partnerships.',
   'docs/04-agentes/identidades/influencer-manager.md',
   ARRAY[]::text[], 'active'),

  ('tracking-specialist', 'tracking-specialist', 'Tracking Specialist',
   'claude-haiku-4-5', 'marketing-activation',
   'GTM, GA4, Meta CAPI, attribution setup.',
   'docs/04-agentes/identidades/tracking-specialist.md',
   ARRAY[]::text[], 'active'),

  ('email-marketer', 'email-marketer', 'Email Marketer',
   'claude-sonnet-4-6', 'marketing-activation',
   'Email campaigns vía Mailgun: secuencias, broadcasts, MJML.',
   'docs/04-agentes/identidades/email-marketer.md',
   ARRAY['email_marketer']::text[], 'active'),

  -- ---------------- Marketing — Optimization (4) ----------------
  ('cro-specialist', 'cro-specialist', 'CRO Specialist',
   'claude-sonnet-4-6', 'marketing-optimization',
   'Landing page CRO + signup/onboarding/form optimization.',
   'docs/04-agentes/identidades/cro-specialist.md',
   ARRAY['cro_strategist']::text[], 'active'),

  ('optimization-agent', 'optimization-agent', 'Optimization Agent',
   'claude-sonnet-4-6', 'marketing-optimization',
   'Post-publication: analiza performance y propone iteraciones.',
   'docs/04-agentes/identidades/optimization-agent.md',
   ARRAY['meta_agent']::text[], 'active'),

  ('growth-hacker', 'growth-hacker', 'Growth Hacker',
   'claude-sonnet-4-6', 'marketing-optimization',
   'Free-tool strategy, referral programs, lead magnets.',
   'docs/04-agentes/identidades/growth-hacker.md',
   ARRAY[]::text[], 'active'),

  ('sales-enablement', 'sales-enablement', 'Sales Enablement',
   'claude-sonnet-4-6', 'marketing-optimization',
   'Pipeline, RevOps, churn prevention via GHL+Mailgun+WhatsApp.',
   'docs/04-agentes/identidades/sales-enablement.md',
   ARRAY[]::text[], 'active'),

  -- ---------------- Client Success (3) ----------------
  ('account-manager', 'account-manager', 'Account Manager',
   'claude-sonnet-4-6', 'client-success',
   'Punto único de contacto operacional con cada cliente.',
   'docs/04-agentes/identidades/account-manager.md',
   ARRAY[]::text[], 'active'),

  ('onboarding-specialist', 'onboarding-specialist', 'Onboarding Specialist',
   'claude-sonnet-4-6', 'client-success',
   'Protocolo de onboarding 5-7 días post-firma.',
   'docs/04-agentes/identidades/onboarding-specialist.md',
   ARRAY[]::text[], 'active'),

  ('reporting-agent', 'reporting-agent', 'Reporting Agent',
   'claude-sonnet-4-6', 'client-success',
   'Reportes semanales/mensuales con narrative + recomendaciones.',
   'docs/04-agentes/identidades/reporting-agent.md',
   ARRAY['client_analyst']::text[], 'active'),

  -- ---------------- SEO Sub-Agents (5) — flagship workflow ----------------
  ('seo-content-strategist', 'seo-content-strategist',
   'SEO Content Strategist',
   'claude-sonnet-4-6', 'flagship-seo',
   'Topical authority + cluster architecture para flagship SEO.',
   'docs/04-agentes/identidades/seo/content-strategist.md',
   ARRAY['content_strategist']::text[], 'active'),

  ('seo-technical', 'seo-technical', 'SEO Technical',
   'claude-haiku-4-5', 'flagship-seo',
   'Crawl audit, Core Web Vitals, schema markup, IndexNow.',
   'docs/04-agentes/identidades/seo/technical-seo.md',
   ARRAY['technical_seo']::text[], 'active'),

  ('seo-geo-optimization', 'seo-geo-optimization',
   'SEO GEO (Generative Engine Optimization)',
   'claude-haiku-4-5', 'flagship-seo',
   'AI Overview / Perplexity / ChatGPT optimization, llms.txt.',
   'docs/04-agentes/identidades/seo/geo-optimization.md',
   ARRAY['geo_optimization']::text[], 'active'),

  ('seo-backlink-strategist', 'seo-backlink-strategist',
   'SEO Backlink Strategist',
   'claude-sonnet-4-6', 'flagship-seo',
   'Backlink prospecting, digital PR, broken-link, HARO.',
   'docs/04-agentes/identidades/seo/backlink-strategist.md',
   ARRAY['backlink_strategist']::text[], 'active'),

  ('seo-orchestrator', 'seo-orchestrator', 'SEO Orchestrator',
   'claude-opus-4-6', 'flagship-seo',
   'Synthesis Opus de los 5 sub-agentes en un playbook 90-d.',
   'docs/04-agentes/identidades/seo/seo-orchestrator.md',
   ARRAY['seo_orchestrator']::text[], 'active'),

  -- ---------------- Review Response (1) ----------------
  ('review-responder', 'review-responder', 'Review Responder',
   'claude-haiku-4-5', 'marketing-activation',
   'Clasifica + redacta respuestas a reviews públicas (Trustpilot/Google/App Stores).',
   'docs/04-agentes/identidades/review-responder.md',
   ARRAY['review_responder']::text[], 'active');

-- ============================================================================
-- Verification
--   SELECT count(*) FROM managed_agents_registry WHERE status='active';
--     -- expected: 33
--
--   -- All 19 workflow slugs must resolve to a canonical slug:
--   SELECT s, resolve_agent_slug(s) FROM unnest(ARRAY[
--     'backlink_strategist','brand_strategist','campaign_brief','client_analyst',
--     'competitive_intelligence','competitive_strategist','content_creator',
--     'content_strategist','copywriter','cro_strategist','email_marketer',
--     'geo_optimization','media_buyer','meta_agent','orchestrator',
--     'review_responder','seo_orchestrator','social_adapter','technical_seo'
--   ]) s;
--     -- expected: zero NULLs
-- ============================================================================
