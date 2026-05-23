-- Migration · Camino III 3-of-N voting infrastructure · 2026-05-22 Sprint 7.6 Track B
-- Single-tenant canon (per PR #56 pattern) · admin-only RLS
--
-- Per CC#2 dispatch [CC2-SPRINT7P6-TRACK-B-CAMINO-III-VOTING] · master plan
-- vault `raw/refs/2026-05-22-sprint7p6-emergency-pilares-residuales-master-plan.md`.
--
-- Camino III 3-of-N voting pattern · review items (campaign · content · brief)
-- get voted on by 3 reviewer agents · gate decision per matrix in
-- `wiki/decisions/2026-05-22-camino-iii-voting-canonization.md`.
--
-- Canonical 3 reviewer trio (per Sprint 7 B8 alias canonization · PR #72) ·
--   qa-reviewer-A → editor-en-jefe        (primary)
--   qa-reviewer-B → brand-strategist      (secondary)
--   qa-reviewer-C → jefe-client-success   (tertiary)

BEGIN;

-- ─── camino_iii_reviews · the review item ───────────────────────────────────
CREATE TABLE IF NOT EXISTS camino_iii_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL
    CHECK (item_type IN (
      'campaign_brief',
      'content_deliverable',
      'phase_5_qa',
      'landing_copy',
      'email_sequence',
      'ad_creative',
      'manual_review',
      'other'
    )),
  item_id TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  campaign_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'escalated_hitl', 'expired', 'cancelled')),
  decision_reason TEXT,
  tabulated_at TIMESTAMPTZ,
  expected_votes_count INTEGER NOT NULL DEFAULT 3
    CHECK (expected_votes_count BETWEEN 1 AND 7),
  green_count INTEGER NOT NULL DEFAULT 0,
  amber_count INTEGER NOT NULL DEFAULT 0,
  red_count INTEGER NOT NULL DEFAULT 0,
  hitl_escalation_ts TIMESTAMPTZ,
  hitl_resolved_by TEXT,
  hitl_resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camino_reviews_client ON camino_iii_reviews(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_camino_reviews_campaign ON camino_iii_reviews(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_camino_reviews_status ON camino_iii_reviews(status);
CREATE INDEX IF NOT EXISTS idx_camino_reviews_item ON camino_iii_reviews(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_camino_reviews_pending ON camino_iii_reviews(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_camino_reviews_hitl ON camino_iii_reviews(hitl_escalation_ts) WHERE hitl_escalation_ts IS NOT NULL;

ALTER TABLE camino_iii_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY camino_reviews_service_role_all ON camino_iii_reviews
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY camino_reviews_admin_full_access ON camino_iii_reviews
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE camino_iii_reviews IS 'Sprint 7.6 · CC#2 · Camino III 3-of-N voting · review item header · status decided when N votes collected · single-tenant canon';

-- ─── camino_iii_votes · individual reviewer votes ───────────────────────────
CREATE TABLE IF NOT EXISTS camino_iii_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES camino_iii_reviews(id) ON DELETE CASCADE,
  reviewer_agent TEXT NOT NULL,
  reviewer_position TEXT
    CHECK (reviewer_position IN ('qa-reviewer-A', 'qa-reviewer-B', 'qa-reviewer-C') OR reviewer_position IS NULL),
  vote TEXT NOT NULL
    CHECK (vote IN ('green', 'amber', 'red')),
  rationale TEXT NOT NULL,
  confidence NUMERIC(3, 2)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  concerns JSONB DEFAULT '[]'::jsonb,
  raw_agent_output JSONB,
  agent_invocation_id TEXT,
  duration_ms INTEGER,
  cost_usd NUMERIC(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, reviewer_agent)
);

CREATE INDEX IF NOT EXISTS idx_camino_votes_review ON camino_iii_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_camino_votes_reviewer ON camino_iii_votes(reviewer_agent);
CREATE INDEX IF NOT EXISTS idx_camino_votes_vote ON camino_iii_votes(vote);
CREATE INDEX IF NOT EXISTS idx_camino_votes_position ON camino_iii_votes(reviewer_position) WHERE reviewer_position IS NOT NULL;

ALTER TABLE camino_iii_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY camino_votes_service_role_all ON camino_iii_votes
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY camino_votes_admin_full_access ON camino_iii_votes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE camino_iii_votes IS 'Sprint 7.6 · CC#2 · individual reviewer votes · 1 row per (review, reviewer_agent) unique · gate decision aggregated into camino_iii_reviews · single-tenant canon';

-- ─── Tabulation function · canonical 3-of-N decision matrix ─────────────────
CREATE OR REPLACE FUNCTION camino_iii_tabulate(p_review_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_review camino_iii_reviews%ROWTYPE;
  v_green INTEGER := 0;
  v_amber INTEGER := 0;
  v_red INTEGER := 0;
  v_total INTEGER := 0;
  v_status TEXT;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_review FROM camino_iii_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'review_not_found', 'review_id', p_review_id);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE vote = 'green'),
    COUNT(*) FILTER (WHERE vote = 'amber'),
    COUNT(*) FILTER (WHERE vote = 'red'),
    COUNT(*)
  INTO v_green, v_amber, v_red, v_total
  FROM camino_iii_votes
  WHERE review_id = p_review_id;

  -- Canonical 3-of-N gate decision matrix ·
  --   ≥2 green AND 0 red    → approved (majority confidence)
  --   ≥2 red                → rejected (majority block)
  --   otherwise             → escalated_hitl (mixed · ambiguous · escalate)
  IF v_total < v_review.expected_votes_count THEN
    v_status := 'pending';
    v_reason := format('awaiting votes · %s/%s collected', v_total, v_review.expected_votes_count);
  ELSIF v_green >= 2 AND v_red = 0 THEN
    v_status := 'approved';
    v_reason := format('majority green · %s/%s · 0 red blocks', v_green, v_total);
  ELSIF v_red >= 2 THEN
    v_status := 'rejected';
    v_reason := format('majority red · %s/%s reject', v_red, v_total);
  ELSE
    v_status := 'escalated_hitl';
    v_reason := format('split decision · %s green · %s amber · %s red · HITL required', v_green, v_amber, v_red);
  END IF;

  UPDATE camino_iii_reviews SET
    status = v_status,
    decision_reason = v_reason,
    tabulated_at = CASE WHEN v_status != 'pending' THEN now() ELSE NULL END,
    hitl_escalation_ts = CASE WHEN v_status = 'escalated_hitl' AND hitl_escalation_ts IS NULL THEN now() ELSE hitl_escalation_ts END,
    green_count = v_green,
    amber_count = v_amber,
    red_count = v_red,
    updated_at = now()
  WHERE id = p_review_id;

  RETURN jsonb_build_object(
    'ok', true,
    'review_id', p_review_id,
    'status', v_status,
    'decision_reason', v_reason,
    'votes', jsonb_build_object('green', v_green, 'amber', v_amber, 'red', v_red, 'total', v_total),
    'expected_votes', v_review.expected_votes_count
  );
END;
$func$;

COMMENT ON FUNCTION camino_iii_tabulate IS 'Sprint 7.6 · canonical 3-of-N gate decision · ≥2 green AND 0 red→approved · ≥2 red→rejected · else escalated_hitl';

COMMIT;
