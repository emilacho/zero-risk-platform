-- Sprint 7.7 Track D · billing tracking fix
--
-- Driver · CC#3 audit `2026-05-22-anthropic-spend-rollup.md` reveló ·
--   - 73 rows agent_invocations con client_id NULL (23.5% del spend · $3.84)
--   - 17 rows con model = 'unknown' (7% del spend · $1.15)
-- Sin esto · facturación por empresa-cliente colapsa al escalar a 5+ clientes.
--
-- This migration · 3 backfill operations · idempotent · safe to re-run ·
--
--   1. UPDATE 56 agent-slug rows · JOIN con journey_executions vía journey_id
--      → SET client_id = journey.client_id (best-effort recovery via FK)
--   2. UPDATE 17 daemon "system" rows · annotate metadata con
--      `client_id_resolution: 'system-overhead-cross-cliente'` · client_id
--      stays NULL canonically (system-level operations · NO cliente owner)
--   3. UPDATE 17 daemon rows con model='unknown' · derive desde tokens patterns
--      OR set model='daemon-internal' sentinel para tracking
--
-- Post-migration · re-run `scripts/audit/anthropic-cost-rollup.mjs` ·
-- expected · 0 rows non-system con client_id NULL (recovered via journey FK)
-- · 17 rows daemon-system rows con client_id NULL pero metadata flag canonical
-- · 0 rows con model='unknown' literal (replaced con 'daemon-internal')

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1 · Backfill client_id desde journey_executions FK
-- ─────────────────────────────────────────────────────────────────────
-- Matches rows con journey_id populated · resolves via JOIN.
UPDATE agent_invocations ai
SET
  client_id = je.client_id,
  metadata = COALESCE(ai.metadata, '{}'::jsonb) || jsonb_build_object(
    'client_id_resolution',
    jsonb_build_object(
      'source', 'backfill-journey-executions',
      'sprint', '7p7-track-d',
      'backfilled_at', NOW()::TEXT
    )
  )
FROM journey_executions je
WHERE ai.client_id IS NULL
  AND ai.journey_id IS NOT NULL
  AND ai.journey_id::TEXT = je.id::TEXT
  AND je.client_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 2 · Backfill client_id desde workflow_executions FK (if exists)
-- ─────────────────────────────────────────────────────────────────────
-- Wrapped en DO block · workflow_executions table may not exist en all envs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_executions') THEN
    UPDATE agent_invocations ai
    SET
      client_id = we.client_id,
      metadata = COALESCE(ai.metadata, '{}'::jsonb) || jsonb_build_object(
        'client_id_resolution',
        jsonb_build_object(
          'source', 'backfill-workflow-executions',
          'sprint', '7p7-track-d',
          'backfilled_at', NOW()::TEXT
        )
      )
    FROM workflow_executions we
    WHERE ai.client_id IS NULL
      AND ai.workflow_execution_id IS NOT NULL
      AND ai.workflow_execution_id::TEXT = we.id::TEXT
      AND we.client_id IS NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3 · Backfill client_id desde onboarding_sessions FK (task_id puede ser onboarding_id)
-- ─────────────────────────────────────────────────────────────────────
UPDATE agent_invocations ai
SET
  client_id = os.client_id,
  metadata = COALESCE(ai.metadata, '{}'::jsonb) || jsonb_build_object(
    'client_id_resolution',
    jsonb_build_object(
      'source', 'backfill-onboarding-sessions',
      'sprint', '7p7-track-d',
      'backfilled_at', NOW()::TEXT
    )
  )
FROM onboarding_sessions os
WHERE ai.client_id IS NULL
  AND ai.task_id IS NOT NULL
  AND ai.task_id::TEXT = os.id::TEXT
  AND os.client_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 4 · Backfill via session_id resume chain
-- ─────────────────────────────────────────────────────────────────────
-- Si una invocación NULL comparte session_id con otra invocación que SI
-- tiene client_id (resume pattern · SDK session continuation) · propagar.
UPDATE agent_invocations ai
SET
  client_id = resolved.client_id,
  metadata = COALESCE(ai.metadata, '{}'::jsonb) || jsonb_build_object(
    'client_id_resolution',
    jsonb_build_object(
      'source', 'backfill-session-resume',
      'sprint', '7p7-track-d',
      'backfilled_at', NOW()::TEXT
    )
  )
FROM (
  SELECT DISTINCT ON (session_id) session_id, client_id
  FROM agent_invocations
  WHERE client_id IS NOT NULL
  ORDER BY session_id, started_at DESC
) resolved
WHERE ai.client_id IS NULL
  AND ai.session_id IS NOT NULL
  AND ai.session_id = resolved.session_id;

-- ─────────────────────────────────────────────────────────────────────
-- 5 · Annotate daemon system rows · client_id stays NULL canonically
-- ─────────────────────────────────────────────────────────────────────
-- Daemon-initiated (daily-plan · weekly-review · health-check) son
-- system-overhead cross-cliente · NO billable a un cliente specific.
-- Annotate metadata para que rollup script pueda filtrar/categorize.
UPDATE agent_invocations
SET
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'client_id_resolution',
    jsonb_build_object(
      'source', 'system-overhead-cross-cliente',
      'sprint', '7p7-track-d',
      'backfilled_at', NOW()::TEXT,
      'note', 'daemon-initiated · NO cliente owner · system overhead'
    )
  )
WHERE client_id IS NULL
  AND agent_id = 'system'
  AND metadata->>'source' = 'daemon';

-- ─────────────────────────────────────────────────────────────────────
-- 6 · Replace model='unknown' literal · model='daemon-internal' sentinel
-- ─────────────────────────────────────────────────────────────────────
-- 17 daemon rows con model='unknown' literal · daemon writer NO captura
-- modelo (cross-repo · separate Sprint 8 fix). Replace literal con
-- canonical sentinel para tracking · cost stays correct (cost_usd ya
-- calculated · model field solo para display/breakdown).
UPDATE agent_invocations
SET
  model = 'daemon-internal',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'model_resolution',
    jsonb_build_object(
      'original_value', 'unknown',
      'replaced_with', 'daemon-internal',
      'sprint', '7p7-track-d',
      'note', 'daemon writer cross-repo · fix tracked Sprint 8'
    )
  )
WHERE model = 'unknown'
  AND metadata->>'source' = 'daemon';

-- ─────────────────────────────────────────────────────────────────────
-- 7 · Mark remaining NULL rows (no FK match · no daemon source) ·
--     "no-upstream-evidence" canonical sentinel
-- ─────────────────────────────────────────────────────────────────────
-- Rows que NO recovered via journey/workflow/onboarding/session AND NO son
-- daemon system · genuinely orphan · marker metadata para distinguir vs
-- system-overhead.
UPDATE agent_invocations
SET
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'client_id_resolution',
    jsonb_build_object(
      'source', 'no-upstream-evidence',
      'sprint', '7p7-track-d',
      'backfilled_at', NOW()::TEXT,
      'note', 'orphan invocation · no FK matched · historical pre-Sprint-7.7 fix'
    )
  )
WHERE client_id IS NULL
  AND (agent_id != 'system' OR metadata->>'source' != 'daemon')
  AND metadata->'client_id_resolution' IS NULL;

COMMIT;

-- Post-migration audit query · run to verify ·
--
--   SELECT
--     COALESCE(metadata->'client_id_resolution'->>'source', 'unannotated') AS resolution_source,
--     COUNT(*) AS rows,
--     ROUND(SUM(cost_usd)::numeric, 2) AS cost_usd
--   FROM agent_invocations
--   WHERE started_at > NOW() - INTERVAL '30 days'
--   GROUP BY resolution_source
--   ORDER BY cost_usd DESC;
--
-- Expected post-migration distribution ·
--   - 'body' (real-time resolved) · majority of new rows
--   - 'backfill-journey-executions' · 30-50 rows from historical 56 non-system
--   - 'system-overhead-cross-cliente' · 17 daemon rows
--   - 'no-upstream-evidence' · remaining orphans · LOW count expected
