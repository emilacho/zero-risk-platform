-- Sprint #6 Brazo 2 · Hybrid B+C persistence scaffolding for Apify Competitive Intel
--
-- Driver · the n8n workflows "Competitive Intelligence 5-Layer Deep Scan" (B1)
-- and "Competitor Daily Monitor" (B2) historically POSTed to two stub endpoints
-- (/api/competitors/snapshot, /api/competitors/deep-report) that wrote to
-- placeholder tables (`competitor_snapshots`, `competitor_deep_reports`) which
-- DID NOT EXIST. Audit 2026-05-15 confirmed both 404 PGRST205. Real competitor
-- data lives in `client_competitive_landscape` (steady-state positioning) but
-- there is no time-series surface for daily snapshots (deltas, news, landing
-- diff over time).
--
-- Hybrid B+C decision (Cowork-Lenovo · 2026-05-15):
--   * Path B · NEW `competitor_snapshots` table · time-series writes from B2 6am
--     cron · one row per (client, competitor, day). Audit trail · daily deltas
--     stay separate from steady-state landscape.
--   * Path C · ALTER existing `client_competitive_landscape` + add
--     `deep_scan_data` JSONB so B1 5-layer scan UPSERTs enriched fields onto
--     the same row (no second source-of-truth table).
--
-- Single transaction · idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- RLS mirrors client_competitive_landscape (single-tenant MC fork pattern).

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- Part B · competitor_snapshots (time-series)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- competitor_id is nullable · the daily monitor sometimes records a
  -- competitor name that hasn't been promoted to client_competitive_landscape
  -- yet (e.g. a new actor surfaced by Serper News). We carry the name and
  -- backfill the FK during a periodic reconciliation pass.
  competitor_id UUID REFERENCES client_competitive_landscape(id) ON DELETE SET NULL,
  competitor_name TEXT NOT NULL,
  competitor_website TEXT,

  -- Day-granular snapshot key · one row per (client, competitor, day) max.
  snapshot_date DATE NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'UTC'),

  -- Source-specific payloads · keep them split so a Firecrawl outage doesn't
  -- block Apify Meta Ads from landing. Aggregate read in `raw_payload`.
  meta_ads_data JSONB DEFAULT '{}'::jsonb,         -- Apify FB Ads Library output
  serper_news_data JSONB DEFAULT '{}'::jsonb,      -- Serper /news result
  firecrawl_landing_data JSONB DEFAULT '{}'::jsonb, -- Firecrawl /scrape result
  raw_payload JSONB DEFAULT '{}'::jsonb,           -- full workflow merge for debug

  -- Lightweight delta flags · the workflow can set has_changes=true when the
  -- aggregate differs from yesterday's row. Drives the "Has Changes? → CI
  -- Agent" branch in B2 without re-running the aggregator at read time.
  has_changes BOOLEAN DEFAULT false,
  change_summary TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uniqueness · one snapshot per (client, competitor_name, day). The B2 cron
-- runs daily; a retry within the same day should overwrite, not duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_competitor_snapshots_client_competitor_date
  ON competitor_snapshots (client_id, competitor_name, snapshot_date);

-- Hot read path · "last N snapshots for client X competitor Y in window"
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_lookup
  ON competitor_snapshots (client_id, competitor_id, snapshot_date DESC);

-- Time-series scans for global trend reports
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_date
  ON competitor_snapshots (snapshot_date DESC);

-- RLS · mirror landscape (service role only · clients table pattern). The
-- workflow service-role connection bypasses RLS; no browser-side reads of
-- this surface exist yet.
ALTER TABLE competitor_snapshots ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- Part C · enrich client_competitive_landscape for deep-report writes
-- ──────────────────────────────────────────────────────────────────────────
-- B1's 5-layer deep scan synthesizes a richer payload than what the steady-
-- state landscape columns capture. Rather than create a second table that
-- would duplicate the (client, competitor) identity pair, we add ONE JSONB
-- column to hold the full strategist synthesis blob + reuse the existing
-- `last_analyzed_at` for the deep-scan timestamp.
ALTER TABLE client_competitive_landscape
  ADD COLUMN IF NOT EXISTS deep_scan_data JSONB DEFAULT '{}'::jsonb;

-- Index on the existing `analysis_source` so the deep-report path can filter
-- "show me rows where last analysis came from the 5-layer scanner".
CREATE INDEX IF NOT EXISTS idx_competitive_analysis_source
  ON client_competitive_landscape (analysis_source)
  WHERE analysis_source IS NOT NULL;

COMMIT;
