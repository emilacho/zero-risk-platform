-- Zero Risk V3 — Schema additions for 13 n8n workflows
-- Single-tenant (no RLS, no organizations). Apply via Supabase SQL Editor.
-- Depends on schema_v2.sql (campaigns, leads, content, etc.) being already applied.
-- Date: 2026-04-15

-- ============================================================================
-- 0. CLIENTS — minimal client registry (the agency serves multiple clients;
--    Zero Risk is just the first one). Used as FK target by every table below.
-- ============================================================================
-- clients table already exists (V2). Add V3 columns if missing.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'EC';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'es';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS brand_voice JSONB DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Seed Zero Risk client using both old and new columns
INSERT INTO clients (slug, name, industry, website_url, domain, country, language)
VALUES ('zero-risk', 'Zero Risk Industrial Safety', 'industrial_safety',
        'https://zerorisk.ec', 'zerorisk.ec', 'EC', 'es')
ON CONFLICT (slug) DO UPDATE SET
  domain = EXCLUDED.domain,
  country = EXCLUDED.country,
  language = EXCLUDED.language
WHERE clients.domain IS NULL;

-- ============================================================================
-- 1. MANAGED_AGENTS_REGISTRY — slug → Anthropic Managed Agent ID mapping.
--    Bridge endpoint /api/agents/run-sdk looks up by slug.
-- ============================================================================
CREATE TABLE IF NOT EXISTS managed_agents_registry (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  managed_agent_id    TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  default_model       TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'
                       CHECK (default_model IN ('claude-haiku-4-5',
                                                'claude-sonnet-4-6',
                                                'claude-opus-4-6')),
  layer               TEXT,                       -- e.g. 'tier-1', 'tier-2', 'flagship'
  description         TEXT,
  system_prompt_ref   TEXT,                       -- path in docs/04-agentes/
  capabilities        JSONB DEFAULT '[]',
  mcp_servers         JSONB DEFAULT '[]',         -- e.g. ['client-brain-rag']
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'deprecated', 'draft')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mar_slug ON managed_agents_registry(slug);
CREATE INDEX IF NOT EXISTS idx_mar_status ON managed_agents_registry(status);

-- ============================================================================
-- 2. SEO_ENGAGEMENTS — one row per Flagship SEO playbook engagement
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_engagements (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id                 TEXT NOT NULL UNIQUE,    -- caller-supplied idempotency key
  client_id               UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain                  TEXT NOT NULL,
  target_keyword          TEXT NOT NULL,
  secondary_keywords      JSONB DEFAULT '[]',
  locale                  JSONB NOT NULL,          -- {country, language, location_code}
  vertical                TEXT,
  tracking_duration_days  INTEGER DEFAULT 90,
  status                  TEXT NOT NULL DEFAULT 'started'
                           CHECK (status IN ('started', 'enriched', 'analyzed',
                                             'synthesized', 'awaiting_review',
                                             'approved', 'executing', 'completed',
                                             'failed')),
  raw_data                JSONB DEFAULT '{}',
  agent_outputs           JSONB DEFAULT '{}',
  playbook                JSONB DEFAULT '{}',
  cost_usd                DECIMAL(10,4) DEFAULT 0,
  started_at              TIMESTAMPTZ DEFAULT now(),
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_eng_client ON seo_engagements(client_id);
CREATE INDEX IF NOT EXISTS idx_seo_eng_status ON seo_engagements(status);
CREATE INDEX IF NOT EXISTS idx_seo_eng_domain ON seo_engagements(domain);

-- ============================================================================
-- 3. SEO_DELIVERABLES — playbook artifacts (pillar, spokes, schema, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_deliverables (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id   UUID NOT NULL REFERENCES seo_engagements(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL                   -- 'pillar', 'spoke', 'schema',
                   CHECK (kind IN ('pillar', 'spoke', 'schema_package',
                                   'llms_txt', 'robots_policy', 'tech_fix',
                                   'backlink_prospects', 'outreach_template',
                                   'content_calendar', 'risk_register',
                                   'kpi_dashboard', 'executive_summary',
                                   'orchestrator_synthesis', 'raw_agent_output')),
  title           TEXT,
  content         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'approved', 'published', 'rejected')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_del_engagement ON seo_deliverables(engagement_id);
CREATE INDEX IF NOT EXISTS idx_seo_del_kind ON seo_deliverables(kind);

-- ============================================================================
-- 4. RANK_TRACKING_DAILY — daily SERP rank snapshots per (engagement, keyword)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rank_tracking_daily (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id       UUID NOT NULL REFERENCES seo_engagements(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain              TEXT NOT NULL,
  keyword             TEXT NOT NULL,
  country             TEXT NOT NULL,
  rank                INTEGER,                     -- NULL = not in top 100
  url                 TEXT,
  serp_features       JSONB DEFAULT '[]',          -- ['featured_snippet','ai_overview',…]
  ai_overview_cited   BOOLEAN DEFAULT FALSE,
  featured_snippet    BOOLEAN DEFAULT FALSE,
  paa_present         BOOLEAN DEFAULT FALSE,
  raw                 JSONB DEFAULT '{}',
  checked_at          DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (engagement_id, keyword, country, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_rank_engagement ON rank_tracking_daily(engagement_id);
CREATE INDEX IF NOT EXISTS idx_rank_keyword_date ON rank_tracking_daily(keyword, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_rank_domain ON rank_tracking_daily(domain);

-- ============================================================================
-- 5. CONTENT_PACKAGES — output of Tier 2 Content Team Orchestrator
--    (campaign brief → creator + copy + email + media → brand strategist → publish)
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_packages (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  brief           JSONB NOT NULL,
  copy            JSONB DEFAULT '{}',              -- variants per channel
  email           JSONB DEFAULT '{}',
  media_plan      JSONB DEFAULT '{}',
  images          JSONB DEFAULT '[]',              -- Ideogram URLs
  videos          JSONB DEFAULT '[]',              -- Higgsfield URLs
  brand_review    JSONB DEFAULT '{}',              -- Opus brand strategist output
  status          TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'awaiting_review', 'approved',
                                     'scheduled', 'published', 'rejected')),
  cost_usd        DECIMAL(10,4) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cp_client ON content_packages(client_id);
CREATE INDEX IF NOT EXISTS idx_cp_status ON content_packages(status);

-- ============================================================================
-- 6. EXPERIMENTS — Landing Page CRO experiments (GrowthBook + Stitch variants)
-- ============================================================================
CREATE TABLE IF NOT EXISTS experiments (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id               UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id              UUID REFERENCES websites(id) ON DELETE SET NULL,
  hypothesis              TEXT NOT NULL,
  growthbook_experiment_id TEXT,
  variants                JSONB NOT NULL,           -- [{name, weight, stitch_ref}]
  primary_metric          TEXT NOT NULL,            -- 'cvr', 'cpl', 'rpv', etc.
  guardrail_metrics       JSONB DEFAULT '[]',
  status                  TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'running', 'paused',
                                             'won', 'lost', 'inconclusive')),
  results                 JSONB DEFAULT '{}',
  started_at              TIMESTAMPTZ,
  ended_at                TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_client ON experiments(client_id);
CREATE INDEX IF NOT EXISTS idx_exp_status ON experiments(status);

-- ============================================================================
-- 7. REVIEW_METRICS — Tier 2 Review Monitor (5 plataformas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS review_metrics (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL                   -- 'google', 'trustpilot', 'meta',
                   CHECK (platform IN ('google', 'trustpilot', 'meta',
                                       'tripadvisor', 'yelp')),
  external_id     TEXT NOT NULL,                   -- review id at the platform
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title           TEXT,
  body            TEXT,
  author          TEXT,
  published_at    TIMESTAMPTZ,
  sentiment       TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  response        TEXT,
  responded_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'awaiting_review', 'responded',
                                     'escalated', 'ignored')),
  raw             JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_rev_client ON review_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_rev_status ON review_metrics(status);
CREATE INDEX IF NOT EXISTS idx_rev_published ON review_metrics(published_at DESC);

-- ============================================================================
-- 8. SOCIAL_SCHEDULES — Tier 2 Social Multi-Platform Publisher
-- ============================================================================
CREATE TABLE IF NOT EXISTS social_schedules (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content_package_id  UUID REFERENCES content_packages(id) ON DELETE SET NULL,
  platform            TEXT NOT NULL
                       CHECK (platform IN ('meta', 'instagram', 'linkedin',
                                           'x', 'tiktok', 'threads', 'youtube')),
  payload             JSONB NOT NULL,              -- text, media URLs, links, hashtags
  scheduled_for       TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled', 'publishing', 'published',
                                         'failed', 'cancelled')),
  external_post_id    TEXT,
  external_url        TEXT,
  error               TEXT,
  attempts            INTEGER DEFAULT 0,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ss_client ON social_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_ss_status_when ON social_schedules(status, scheduled_for);

-- ============================================================================
-- 9. SOCIAL_METRICS — engagement metrics per published post
-- ============================================================================
CREATE TABLE IF NOT EXISTS social_metrics (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id         UUID NOT NULL REFERENCES social_schedules(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  impressions         INTEGER DEFAULT 0,
  reach               INTEGER DEFAULT 0,
  likes               INTEGER DEFAULT 0,
  comments            INTEGER DEFAULT 0,
  shares              INTEGER DEFAULT 0,
  saves               INTEGER DEFAULT 0,
  clicks              INTEGER DEFAULT 0,
  video_views         INTEGER DEFAULT 0,
  engagement_rate     DECIMAL(6,4) DEFAULT 0,
  raw                 JSONB DEFAULT '{}',
  measured_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (schedule_id, measured_at)
);

CREATE INDEX IF NOT EXISTS idx_sm_client ON social_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_sm_measured ON social_metrics(measured_at DESC);

-- ============================================================================
-- 10. CLIENT_REPORTS — Tier 2 Weekly Client Report Generator (white-label)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_reports (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'weekly'
                   CHECK (kind IN ('weekly', 'monthly', 'quarterly', 'ad_hoc')),
  summary         JSONB NOT NULL,                  -- kpis, narrative, charts spec
  pdf_url         TEXT,
  delivered_to    JSONB DEFAULT '[]',              -- emails / slack channels
  delivered_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'awaiting_review', 'approved',
                                     'delivered', 'failed')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, period_start, period_end, kind)
);

CREATE INDEX IF NOT EXISTS idx_cr_client_period ON client_reports(client_id, period_end DESC);

-- ============================================================================
-- 11. HITL_QUEUE — Mission Control human-in-the-loop inbox
-- ============================================================================
-- hitl_queue already exists (V2). Add V3 columns if missing.
ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}';
ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS reviewer TEXT;
ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS decision JSONB DEFAULT '{}';
ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hitl_status_priority ON hitl_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_hitl_client ON hitl_queue(client_id);
CREATE INDEX IF NOT EXISTS idx_hitl_type ON hitl_queue(type);

-- ============================================================================
-- 12. AGENT_OUTCOMES — feedback loop (pillar 5 of Opción 4)
--    Tracks whether agent outputs led to good business outcomes.
-- ============================================================================
-- agent_outcomes already exists (V2). Add V3 columns if missing.
ALTER TABLE agent_outcomes ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE agent_outcomes ADD COLUMN IF NOT EXISTS agent_log_id UUID;
ALTER TABLE agent_outcomes ADD COLUMN IF NOT EXISTS task_kind TEXT;
ALTER TABLE agent_outcomes ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE agent_outcomes ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE agent_outcomes ADD COLUMN IF NOT EXISTS hitl_decision TEXT;
ALTER TABLE agent_outcomes ADD COLUMN IF NOT EXISTS business_outcome JSONB DEFAULT '{}';
ALTER TABLE agent_outcomes ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_outcomes_agent ON agent_outcomes(agent_slug);
CREATE INDEX IF NOT EXISTS idx_outcomes_kind ON agent_outcomes(task_kind);

-- ============================================================================
-- DONE. Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name IN
--     ('clients','managed_agents_registry','seo_engagements','seo_deliverables',
--      'rank_tracking_daily','content_packages','experiments','review_metrics',
--      'social_schedules','social_metrics','client_reports','hitl_queue',
--      'agent_outcomes')
--   ORDER BY table_name;
-- Should return 13 rows.
-- ============================================================================
