-- Sprint 5 wire-in · expand social_posts.status CHECK constraint to include
-- `pending_approval` (HITL gate before scheduled) + `approved` (mid-state if
-- needed for audit). Sprint 4 migration shipped status enum without these
-- (scheduled/publishing/published/failed). NEXUS Phase content cascade
-- produces `pending_approval` by default · HITL approves → `scheduled` ·
-- n8n cron publishes → `published` or `failed`.
--
-- Idempotent · safe to re-run.

ALTER TABLE social_posts
  DROP CONSTRAINT IF EXISTS social_posts_status_check;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_status_check
  CHECK (status IN (
    'pending_approval',
    'approved',
    'scheduled',
    'publishing',
    'published',
    'failed'
  ));

CREATE INDEX IF NOT EXISTS idx_social_posts_pending_approval
  ON social_posts (created_at DESC)
  WHERE status = 'pending_approval';

COMMENT ON CONSTRAINT social_posts_status_check ON social_posts IS
  'Sprint 5 expanded · HITL gate flow · pending_approval (NEXUS Phase content '
  'cascade default) → approved → scheduled (n8n cron picks up) → publishing '
  '→ published OR failed.';
