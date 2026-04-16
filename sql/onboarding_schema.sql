-- ============================================================
-- ZERO RISK V3 — ONBOARDING SCHEMA (Pilar 6)
-- Auto-discovery + 7-day onboarding flow tracking
--
-- The Client Brain tables already exist (client_brain_schema.sql).
-- This schema adds the onboarding orchestration layer.
--
-- Run in Supabase SQL Editor AFTER client_brain_schema.sql
-- Idempotent: safe to re-run
-- ============================================================

-- ============================================================
-- Step 1: onboarding_sessions — Tracks the 7-day onboarding flow
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Input provided by client/sales
  website_url TEXT NOT NULL,
  company_name TEXT NOT NULL,
  industry TEXT,
  target_audience TEXT,                  -- Free text: "empresas industriales en Ecuador"
  competitor_urls TEXT[] DEFAULT '{}',   -- Up to 5 competitor URLs
  additional_notes TEXT,                 -- Any extra context

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',             -- Created, waiting to start
      'discovering',         -- Day 1: auto-discovery in progress
      'discovered',          -- Day 1 complete: v0 data generated
      'intake_sent',         -- Day 2: form sent to client
      'intake_received',     -- Day 2: form responses received
      'enriching',           -- Days 3-4: deep enrichment running
      'review_ready',        -- Day 5: ready for Emilio HITL review
      'reviewed',            -- Day 5: Emilio approved
      'kickoff_scheduled',   -- Day 6: call scheduled
      'active',              -- Day 7: client activated
      'failed',              -- Something went wrong
      'cancelled'            -- Cancelled by user
    )),
  current_day INTEGER DEFAULT 0,         -- 0-7 tracking which day we're on

  -- Discovery results tracking
  discovery_started_at TIMESTAMPTZ,
  discovery_completed_at TIMESTAMPTZ,
  brand_book_id UUID,                    -- FK to client_brand_books.id (v0)
  icp_count INTEGER DEFAULT 0,           -- How many ICPs generated
  voc_count INTEGER DEFAULT 0,           -- How many VOC quotes found
  competitor_count INTEGER DEFAULT 0,    -- How many competitors analyzed

  -- Scraping metadata
  pages_scraped INTEGER DEFAULT 0,
  scrape_errors TEXT[] DEFAULT '{}',     -- URLs that failed
  scrape_metadata JSONB DEFAULT '{}',    -- Raw scraping stats

  -- Intake form
  intake_form_url TEXT,                  -- GoHighLevel form URL
  intake_form_sent_at TIMESTAMPTZ,
  intake_form_received_at TIMESTAMPTZ,
  intake_responses JSONB DEFAULT '{}',   -- Raw form responses

  -- HITL review
  hitl_status TEXT DEFAULT 'pending'
    CHECK (hitl_status IN ('pending', 'approved', 'revision_needed', 'rejected')),
  hitl_reviewer TEXT,                    -- 'emilio'
  hitl_feedback TEXT,
  hitl_reviewed_at TIMESTAMPTZ,

  -- Activation
  activated_at TIMESTAMPTZ,
  embeddings_generated BOOLEAN DEFAULT false,

  -- Cost tracking
  total_api_calls INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_client ON onboarding_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_sessions(status);

-- ============================================================
-- Step 2: onboarding_discovery_logs — Detailed log per discovery action
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_discovery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,

  -- What was done
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'scrape_homepage',      -- Scrape client's homepage
      'scrape_about',         -- Scrape about/company page
      'scrape_services',      -- Scrape services/products page
      'scrape_contact',       -- Scrape contact page
      'scrape_blog',          -- Scrape blog/news page
      'scrape_competitor',    -- Scrape a competitor's site
      'scrape_reviews',       -- Scrape Google Reviews / social
      'analyze_brand',        -- Claude analysis of brand voice
      'analyze_competitors',  -- Claude analysis of competitive landscape
      'analyze_voc',          -- Claude analysis of voice of customer
      'analyze_icp',          -- Claude inference of ICP from site content
      'generate_embedding',   -- Generate embedding for a document
      'other'
    )),
  target_url TEXT,                       -- URL that was scraped/analyzed
  agent_name TEXT,                       -- Which agent did this

  -- Results
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result_summary TEXT,                   -- Brief description of what was found
  result_data JSONB DEFAULT '{}',        -- Raw result data
  error_message TEXT,

  -- Cost
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discovery_logs_onboarding ON onboarding_discovery_logs(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_discovery_logs_action ON onboarding_discovery_logs(action_type);

-- ============================================================
-- Step 3: RLS Policies
-- ============================================================
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_discovery_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'onboarding_sessions',
    'onboarding_discovery_logs'
  ]) LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "auth_full_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t, t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format(
        'CREATE POLICY "service_full_%s" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t, t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================
-- Step 4: Trigger for updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_onboarding_sessions_updated ON onboarding_sessions;
CREATE TRIGGER trg_onboarding_sessions_updated
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SUMMARY
-- ============================================================
-- Tables created:
--   1. onboarding_sessions — tracks 7-day onboarding flow per client
--   2. onboarding_discovery_logs — detailed log of each scrape/analysis action
--
-- These work WITH the existing Client Brain tables:
--   - clients (master record)
--   - client_brand_books (auto-populated by Brand Strategist)
--   - client_icp_documents (auto-populated from analysis + form)
--   - client_voc_library (auto-populated from reviews/social)
--   - client_competitive_landscape (auto-populated from competitor scraping)
-- ============================================================
