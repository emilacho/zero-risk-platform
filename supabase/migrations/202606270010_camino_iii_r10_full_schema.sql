-- Migration · Camino III R10 · single-file full schema · 2026-06-27 · CC#2 · §144 batch
--
-- ONE authoritative file that creates/updates the 3 Camino III tables:
--   camino_iii_reviews · camino_iii_votes · editorial_decisions
--
-- Fully IDEMPOTENT (CREATE TABLE IF NOT EXISTS · ADD COLUMN IF NOT EXISTS ·
-- CREATE INDEX IF NOT EXISTS · DROP POLICY IF EXISTS before CREATE). Safe to
-- apply whether or not the earlier migration 202605220000 was already applied.
--
-- §144 · HELD · NOT applied to prod in this batch. Apply via repo tooling only.
--
-- Guardrails covered ·
--   · UNIQUE(item_type, item_id) on reviews  → idempotency of review creation
--   · real FKs (clients · reviews)            → referential integrity
--   · created_at everywhere                   → audit
--   · RLS service_role + admin on all 3       → single-tenant canon
--   · editorial_decisions                     → gate audit trail (§150 #4)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · camino_iii_reviews · the review item (header · gate state)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS camino_iii_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL
    CHECK (item_type IN (
      'campaign_brief','content_deliverable','phase_5_qa','landing_copy',
      'email_sequence','ad_creative','manual_review','other'
    )),
  item_id TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  campaign_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','escalated_hitl','expired','cancelled')),
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

-- Idempotency guardrail · one open review per (item_type, item_id).
-- Unique index form so it is IF NOT EXISTS-safe (ADD CONSTRAINT is not).
CREATE UNIQUE INDEX IF NOT EXISTS ux_camino_reviews_item_unique
  ON camino_iii_reviews(item_type, item_id);

CREATE INDEX IF NOT EXISTS idx_camino_reviews_client ON camino_iii_reviews(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_camino_reviews_campaign ON camino_iii_reviews(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_camino_reviews_status ON camino_iii_reviews(status);
CREATE INDEX IF NOT EXISTS idx_camino_reviews_pending ON camino_iii_reviews(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_camino_reviews_hitl ON camino_iii_reviews(hitl_escalation_ts) WHERE hitl_escalation_ts IS NOT NULL;

ALTER TABLE camino_iii_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS camino_reviews_service_role_all ON camino_iii_reviews;
CREATE POLICY camino_reviews_service_role_all ON camino_iii_reviews
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS camino_reviews_admin_full_access ON camino_iii_reviews;
CREATE POLICY camino_reviews_admin_full_access ON camino_iii_reviews
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE camino_iii_reviews IS 'Camino III R10 · 3-of-N voting · review item header · UNIQUE(item_type,item_id) idempotent · single-tenant';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · camino_iii_votes · individual reviewer votes (incl. non-voting advisor)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS camino_iii_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES camino_iii_reviews(id) ON DELETE CASCADE,
  reviewer_agent TEXT NOT NULL,
  reviewer_position TEXT
    CHECK (reviewer_position IN ('qa-reviewer-A','qa-reviewer-B','qa-reviewer-C') OR reviewer_position IS NULL),
  vote TEXT NOT NULL CHECK (vote IN ('green','amber','red')),
  rationale TEXT NOT NULL,
  confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  concerns JSONB DEFAULT '[]'::jsonb,
  raw_agent_output JSONB,
  agent_invocation_id TEXT,
  duration_ms INTEGER,
  cost_usd NUMERIC(10,6),
  -- R10 · advisory lane · true counts toward gate · false = non-voting advisor (GPT-5.5)
  is_voting BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, reviewer_agent)
);

-- idempotent column add (if 202605220000 created the table without is_voting)
ALTER TABLE camino_iii_votes ADD COLUMN IF NOT EXISTS is_voting BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_camino_votes_review ON camino_iii_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_camino_votes_reviewer ON camino_iii_votes(reviewer_agent);
CREATE INDEX IF NOT EXISTS idx_camino_votes_vote ON camino_iii_votes(vote);
CREATE INDEX IF NOT EXISTS idx_camino_votes_position ON camino_iii_votes(reviewer_position) WHERE reviewer_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_camino_votes_advisors ON camino_iii_votes(review_id) WHERE is_voting = false;

ALTER TABLE camino_iii_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS camino_votes_service_role_all ON camino_iii_votes;
CREATE POLICY camino_votes_service_role_all ON camino_iii_votes
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS camino_votes_admin_full_access ON camino_iii_votes;
CREATE POLICY camino_votes_admin_full_access ON camino_iii_votes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE camino_iii_votes IS 'Camino III R10 · 1 row per (review, reviewer) · is_voting=false = advisor (GPT-5.5) captured but not tallied';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · editorial_decisions · gate audit trail (§150 #4) · machine + human verdict
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 row per reviewed piece (UNIQUE review_id). Machine verdict written by the
-- tabulation function. On ESCALATE the human resolver fills final_verdict +
-- resolved_by + resolved_at in the SAME row. PASS/REJECT auto-resolve.
CREATE TABLE IF NOT EXISTS editorial_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES camino_iii_reviews(id) ON DELETE CASCADE,
  -- denormalized for audit query without join
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- lifecycle · starts PENDING · RESOLVED once a final verdict exists
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RESOLVED')),

  -- machine verdict · written by camino_iii_tabulate
  machine_verdict TEXT CHECK (machine_verdict IN ('PASS','REJECT','ESCALATE')),
  machine_decided_at TIMESTAMPTZ,
  green_count INTEGER NOT NULL DEFAULT 0,
  amber_count INTEGER NOT NULL DEFAULT 0,
  red_count INTEGER NOT NULL DEFAULT 0,

  -- human verdict · written by resolver on ESCALATE (same row)
  final_verdict TEXT CHECK (final_verdict IN ('PASS','REJECT','ESCALATE')),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,

  rationale TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (review_id)
);

CREATE INDEX IF NOT EXISTS idx_editorial_review ON editorial_decisions(review_id);
CREATE INDEX IF NOT EXISTS idx_editorial_client ON editorial_decisions(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_editorial_status ON editorial_decisions(status);
CREATE INDEX IF NOT EXISTS idx_editorial_pending ON editorial_decisions(status, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_editorial_item ON editorial_decisions(item_type, item_id);

ALTER TABLE editorial_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS editorial_service_role_all ON editorial_decisions;
CREATE POLICY editorial_service_role_all ON editorial_decisions
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS editorial_admin_full_access ON editorial_decisions;
CREATE POLICY editorial_admin_full_access ON editorial_decisions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE editorial_decisions IS 'Camino III R10 · gate audit trail (§150 #4) · 1 row/review · machine_verdict (auto) + final_verdict/resolved_by/resolved_at (human on ESCALATE)';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · tabulation · counts voting rows only · writes machine verdict to audit trail
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_machine TEXT;        -- PASS | REJECT | ESCALATE
BEGIN
  SELECT * INTO v_review FROM camino_iii_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'review_not_found', 'review_id', p_review_id);
  END IF;

  -- VOTING reviewers only · advisors (is_voting=false) excluded from tally + gate
  SELECT
    COUNT(*) FILTER (WHERE vote = 'green'),
    COUNT(*) FILTER (WHERE vote = 'amber'),
    COUNT(*) FILTER (WHERE vote = 'red'),
    COUNT(*)
  INTO v_green, v_amber, v_red, v_total
  FROM camino_iii_votes
  WHERE review_id = p_review_id AND is_voting = true;

  -- Canonical 3-of-N matrix · ≥2 green AND 0 red→approved · ≥2 red→rejected · else escalate
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
    green_count = v_green, amber_count = v_amber, red_count = v_red,
    updated_at = now()
  WHERE id = p_review_id;

  -- Audit trail · write machine verdict once the gate decides (not while pending).
  -- PASS/REJECT auto-resolve in-row · ESCALATE waits for the human resolver.
  IF v_status <> 'pending' THEN
    v_machine := CASE v_status
      WHEN 'approved' THEN 'PASS'
      WHEN 'rejected' THEN 'REJECT'
      ELSE 'ESCALATE'
    END;

    INSERT INTO editorial_decisions (
      review_id, item_type, item_id, client_id, status,
      machine_verdict, machine_decided_at, green_count, amber_count, red_count,
      final_verdict, resolved_by, resolved_at, rationale
    ) VALUES (
      p_review_id, v_review.item_type, v_review.item_id, v_review.client_id,
      CASE WHEN v_machine = 'ESCALATE' THEN 'PENDING' ELSE 'RESOLVED' END,
      v_machine, now(), v_green, v_amber, v_red,
      CASE WHEN v_machine = 'ESCALATE' THEN NULL ELSE v_machine END,
      CASE WHEN v_machine = 'ESCALATE' THEN NULL ELSE 'camino_iii_auto' END,
      CASE WHEN v_machine = 'ESCALATE' THEN NULL ELSE now() END,
      v_reason
    )
    ON CONFLICT (review_id) DO UPDATE SET
      machine_verdict = EXCLUDED.machine_verdict,
      machine_decided_at = EXCLUDED.machine_decided_at,
      green_count = EXCLUDED.green_count,
      amber_count = EXCLUDED.amber_count,
      red_count = EXCLUDED.red_count,
      -- never clobber a human-resolved final verdict on re-tabulation
      status = CASE WHEN editorial_decisions.final_verdict IS NOT NULL
                    THEN editorial_decisions.status ELSE EXCLUDED.status END,
      final_verdict = COALESCE(editorial_decisions.final_verdict, EXCLUDED.final_verdict),
      resolved_by = COALESCE(editorial_decisions.resolved_by, EXCLUDED.resolved_by),
      resolved_at = COALESCE(editorial_decisions.resolved_at, EXCLUDED.resolved_at),
      rationale = EXCLUDED.rationale;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'review_id', p_review_id,
    'status', v_status,
    'machine_verdict', v_machine,
    'decision_reason', v_reason,
    'votes', jsonb_build_object('green', v_green, 'amber', v_amber, 'red', v_red, 'total', v_total),
    'expected_votes', v_review.expected_votes_count
  );
END;
$func$;

COMMENT ON FUNCTION camino_iii_tabulate IS 'Camino III R10 · counts is_voting=true only · writes machine verdict to editorial_decisions (PASS/REJECT auto-resolve · ESCALATE awaits human)';

COMMIT;
