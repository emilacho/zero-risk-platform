-- Resolve 3 deferred agent backfills · canonical-first per PR #26 path 1
-- (2026-05-16 · post `2026-05-16-backfill-35-placeholder-identities.sql`)
--
-- The backfill migration earlier today left 35 placeholder rows in `agents`
-- with `identity_content = 'pending-identity'` and `identity_source =
-- 'deferred:no-canonical-no-registry-no-local · backfill-35-pla...'`. Three
-- of those flagged by CC#2 as priority resolve:
--
--   1. customer_research_agent       → adopt canonical `customer-research`
--   2. influencer_partnerships_manager → adopt canonical `influencer-manager`
--   3. video_editor_motion_designer  → ALREADY resolved in PR #38 (no-op here · idempotent)
--
-- Strategy · PR #26 path 1 (canonical-first) · registry already has 6148/
-- 4323-char production-quality identity_md for slugs 1+2 · copy that to
-- the `agents` row · update identity_source with provenance tag pointing
-- to canonical lineage + this branch.
--
-- We do NOT rename the agents.name column · the legacy underscored slug
-- stays (`customer_research_agent`) to maintain backwards-compat with
-- any callers using that name · the runner's slug resolver maps to the
-- canonical registry row via aliases (this migration also adds the
-- legacy underscored slugs to the registry.aliases array so resolution
-- works either way).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1 · customer_research_agent · adopt canonical customer-research
-- ─────────────────────────────────────────────────────────────────────
UPDATE agents
SET
  identity_content = (SELECT identity_md FROM managed_agents_registry WHERE slug = 'customer-research'),
  identity_source = 'canonical-adopt (managed_agents_registry.customer-research → msitarzewski/agency-agents) · feat/3-deferred-agents-resolved',
  model = 'claude-sonnet-4-6',
  updated_at = now()
WHERE name = 'customer_research_agent'
  AND (identity_content IS NULL
       OR identity_content = 'pending-identity'
       OR length(identity_content) < 100);

-- Add legacy slug to registry aliases so slug-resolver matches either name
UPDATE managed_agents_registry
SET
  aliases = (
    SELECT array_agg(DISTINCT a)
    FROM unnest(COALESCE(aliases, ARRAY[]::TEXT[]) || ARRAY['customer_research_agent']::TEXT[]) AS a
  ),
  updated_at = now()
WHERE slug = 'customer-research'
  AND NOT ('customer_research_agent' = ANY(COALESCE(aliases, ARRAY[]::TEXT[])));

-- ─────────────────────────────────────────────────────────────────────
-- 2 · influencer_partnerships_manager · adopt canonical influencer-manager
-- ─────────────────────────────────────────────────────────────────────
UPDATE agents
SET
  identity_content = (SELECT identity_md FROM managed_agents_registry WHERE slug = 'influencer-manager'),
  identity_source = 'canonical-adopt (managed_agents_registry.influencer-manager → msitarzewski/agency-agents) · feat/3-deferred-agents-resolved',
  model = 'claude-sonnet-4-6',
  updated_at = now()
WHERE name = 'influencer_partnerships_manager'
  AND (identity_content IS NULL
       OR identity_content = 'pending-identity'
       OR length(identity_content) < 100);

UPDATE managed_agents_registry
SET
  aliases = (
    SELECT array_agg(DISTINCT a)
    FROM unnest(COALESCE(aliases, ARRAY[]::TEXT[]) || ARRAY['influencer_partnerships_manager']::TEXT[]) AS a
  ),
  updated_at = now()
WHERE slug = 'influencer-manager'
  AND NOT ('influencer_partnerships_manager' = ANY(COALESCE(aliases, ARRAY[]::TEXT[])));

-- ─────────────────────────────────────────────────────────────────────
-- 3 · video_editor_motion_designer · ALREADY resolved PR #38 · no-op
-- ─────────────────────────────────────────────────────────────────────
-- Verification only · if the prior PR #38 row exists with the gap-2 marker,
-- this migration is a true no-op. If for some reason the row is missing
-- the marker, this UPDATE is idempotent and re-applies the canonical content
-- (registry.video-editor identity_md is what PR #38 also wrote · same source).
UPDATE agents
SET
  identity_content = (SELECT identity_md FROM managed_agents_registry WHERE slug = 'video-editor'),
  identity_source = 'canonical-adopt (managed_agents_registry.video-editor → PR #38 lineage) · feat/3-deferred-agents-resolved',
  updated_at = now()
WHERE name = 'video-editor'
  AND (identity_content IS NULL
       OR identity_content = 'pending-identity'
       OR length(identity_content) < 100);

COMMIT;
