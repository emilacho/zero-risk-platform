-- Migration · Camino III · 4th NON-voting reviewer (GPT-5.5 advisor) · 2026-06-27 · CC#2
--
-- Adds a non-voting advisor lane to the 3-of-N gate. The GPT-5.5 advisor
-- (reviewer_agent='gpt-5.5-advisor' · reviewer_position NULL · qa-advisor-D)
-- records a review that is captured for the editorial record + HITL context
-- but NEVER counts toward the gate decision.
--
-- Mechanism · new column `is_voting` (default true · backward-compatible) +
-- `camino_iii_tabulate` updated to tally / gate on is_voting=true rows only.
-- Advisors set is_voting=false. The canonical 3-of-N math is unchanged.
--
-- Paired code · src/lib/camino-iii/reviewers.ts · src/lib/camino-iii/tabulate.ts
-- Idempotent · safe re-apply.

BEGIN;

-- ─── 1 · non-voting flag ─────────────────────────────────────────────────────
ALTER TABLE camino_iii_votes
  ADD COLUMN IF NOT EXISTS is_voting BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN camino_iii_votes.is_voting IS
  'Sprint §144 · CC#2 · true = counts toward 3-of-N gate · false = advisor (GPT-5.5 qa-advisor-D) · captured but never tallied';

-- Partial index · advisors are rare · speeds advisory lookups without bloating the hot path
CREATE INDEX IF NOT EXISTS idx_camino_votes_advisors
  ON camino_iii_votes(review_id) WHERE is_voting = false;

-- ─── 2 · tabulation counts voting rows only ─────────────────────────────────
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

  -- VOTING reviewers only · advisors (is_voting=false) excluded from tally + gate.
  SELECT
    COUNT(*) FILTER (WHERE vote = 'green'),
    COUNT(*) FILTER (WHERE vote = 'amber'),
    COUNT(*) FILTER (WHERE vote = 'red'),
    COUNT(*)
  INTO v_green, v_amber, v_red, v_total
  FROM camino_iii_votes
  WHERE review_id = p_review_id
    AND is_voting = true;

  -- Canonical 3-of-N gate decision matrix (unchanged) ·
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

COMMENT ON FUNCTION camino_iii_tabulate IS 'Sprint §144 · 3-of-N gate · counts is_voting=true rows only · advisors (GPT-5.5) excluded · ≥2 green AND 0 red→approved · ≥2 red→rejected · else escalated_hitl';

COMMIT;
