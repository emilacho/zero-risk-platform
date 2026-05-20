-- Sprint 4 · Social planner · Camino B (Meta Graph via n8n).
--
-- Per decision `zr-vault/wiki/decisions/2026-05-20-social-planner-camino-elegido.md`
-- · cubre IG + FB nativamente · cron 5min n8n workflow publica · sin
-- vendor lock-in Metricool. LinkedIn + TikTok diferidos a Sprint #N+
-- (requieren OAuth flows separados).
--
-- Idempotent · safe to re-run.

CREATE TABLE IF NOT EXISTS social_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network             TEXT NOT NULL CHECK (network IN ('facebook', 'instagram')),
  content             TEXT NOT NULL,
  media_urls          JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at        TIMESTAMPTZ NOT NULL,
  published_at        TIMESTAMPTZ,
  provider_post_id    TEXT UNIQUE,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'publishing', 'published', 'failed')),
  error_detail        TEXT,
  client_id           TEXT,
  caller              TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Schedule cap · prevent runaway scheduled_at far future (30 days)
  CONSTRAINT social_posts_schedule_cap
    CHECK (scheduled_at <= NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled
  ON social_posts (scheduled_at, status)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_social_posts_network_status
  ON social_posts (network, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_client
  ON social_posts (client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_provider_id
  ON social_posts (provider_post_id)
  WHERE provider_post_id IS NOT NULL;

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_posts_service_role_all"
  ON social_posts;

CREATE POLICY "social_posts_service_role_all"
  ON social_posts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE social_posts IS
  'Social planner · scheduled posts for Meta Graph publish (IG + FB only · Sprint 4). '
  'n8n workflow cron 5min checks scheduled_at <= NOW() · publishes via Graph v21 · '
  'UPDATE status + provider_post_id post-publish. Schedule cap 30 days hard CHECK constraint.';
