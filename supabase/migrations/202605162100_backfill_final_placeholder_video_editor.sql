-- Backfill final placeholder · agents.video_editor_motion_designer · 2026-05-16
--
-- Context · Layer C of the 35-placeholder audit had 4 deferred rows. Three
-- were resolved by prior PRs:
--   - customer_research_agent → PR #43 (3-deferred-resolved)
--   - influencer_partnerships_manager → PR #43
--   - market_research_analyst → CC#2 Path D fix (separate PR)
--
-- One remaining at audit time of this dispatch (2026-05-16T16:30Z):
--   - video_editor_motion_designer · still identity_content='pending-identity' (16 chars)
--
-- The canonical `video-editor` row in `managed_agents_registry` (10158 chars ·
-- includes Gap 2 motion-designer-social-cascade scope block per PR #38) is
-- the right source. Underscored `video_editor_motion_designer` is just the
-- legacy slug for the same role · adopt canonical content + add underscored
-- slug to registry.video-editor.aliases for slug-resolver bridging.
--
-- PR #26 path 1 (canonical-first) · idempotent · safe to re-run.

BEGIN;

-- 1 · Backfill agents row with canonical content
UPDATE agents
SET
  identity_content = (SELECT identity_md FROM managed_agents_registry WHERE slug = 'video-editor'),
  identity_source = 'canonical-adopt (managed_agents_registry.video-editor → PR #38 lineage · final Layer C deferred resolved) · feat/backfill-final-placeholder-row',
  model = 'claude-opus-4-6',
  updated_at = now()
WHERE name = 'video_editor_motion_designer'
  AND (identity_content IS NULL
       OR identity_content = 'pending-identity'
       OR length(identity_content) < 100);

-- 2 · Add underscored legacy slug to registry aliases (idempotent)
UPDATE managed_agents_registry
SET
  aliases = (
    SELECT array_agg(DISTINCT a)
    FROM unnest(COALESCE(aliases, ARRAY[]::TEXT[]) || ARRAY['video_editor_motion_designer']::TEXT[]) AS a
  ),
  updated_at = now()
WHERE slug = 'video-editor'
  AND NOT ('video_editor_motion_designer' = ANY(COALESCE(aliases, ARRAY[]::TEXT[])));

COMMIT;
