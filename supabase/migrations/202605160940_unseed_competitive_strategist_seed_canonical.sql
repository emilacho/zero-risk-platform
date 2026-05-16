-- IDENTITY-RESTORE-3-FIXES · FIX 2 · 2026-05-16 · Emilio approved
--
-- Undoes the PR #22 project-local invention `competitive_strategist` and seeds
-- the canonical row `competitive-intelligence-agent` from `managed_agents_registry`.
--
-- Why · CC#1/CC#2/CC#3 convergent audit (Slack #equipo 2026-05-16) confirmed:
--   1. `competitive_strategist` (PR #22 · migration 202605152200) was a project-local
--      duplicate definition · `competitive-intelligence-agent` already exists in
--      `managed_agents_registry` as the canonical slug, and `schema_v3_agents_alignment.sql`
--      line 107 already lists `competitive_strategist` as one of its ALIASES.
--   2. The `agents` table runtime lookup (`services/agent-runner/.../agent-sdk-runner.ts:187`)
--      reads identity_content from `agents.name`. The PR #22 insert created a row
--      whose 2327-char synthesizer-of-5-layers prompt narrowed the canonical
--      "Competitive Intelligence Agent" role to the B1 5-layer scan synthesis step.
--   3. Canonical identity_md in `managed_agents_registry` is 6378 chars · broader
--      role coverage · also Opus.
--
-- Path B per [DISPATCH-CC2-IDENTITY-RESTORE-3-FIXES] · delete invention + seed canonical.
--
-- Live state changes also applied (idempotent re-runs ok):
--   • Service-role REST DELETE/INSERT against Supabase (this file documents what was
--     applied · re-running is a no-op since `WHERE name=` filters protect it).
--   • n8n workflow `vRSkPFxe5IbdQbz3` (Zero Risk — Competitive Intelligence 5-Layer
--     Deep Scan) strategist node payload patched in-place: `agent: "competitive_strategist"`
--     → `agent: "competitive-intelligence-agent"`. Pre-patch versionId
--     825e32a8-c626-420a-b29d-3ef603d5db36 → post-patch 31dd80cb-370b-41c7-8707-b9d0ee742edc.
--   • Local JSON `n8n-workflows/tier-2/competitive-intelligence-5layer.json` also patched
--     for re-import parity.
--
-- PR #22's seed migration (`202605152200_seed_competitive_strategist_agent.sql`) is kept
-- as historical record · this migration is the reversal · forward-only.

BEGIN;

-- Step 1 · remove PR #22 invented row
DELETE FROM agents WHERE name = 'competitive_strategist';

-- Step 2 · seed canonical row from managed_agents_registry if not already present
-- (ON CONFLICT DO NOTHING keeps re-runs idempotent · no upsert intent)
INSERT INTO agents (
  name,
  display_name,
  role,
  identity_source,
  identity_content,
  model,
  status
)
SELECT
  r.slug,
  r.display_name,
  'empleado',
  'managed_agents_registry · canonical seed post-PR#22-unseed · CC#2 IDENTITY-RESTORE-3-FIXES · 2026-05-16 Emilio approved',
  r.identity_md,
  r.default_model,
  'active'
FROM managed_agents_registry r
WHERE r.slug = 'competitive-intelligence-agent'
  AND NOT EXISTS (
    SELECT 1 FROM agents a WHERE a.name = 'competitive-intelligence-agent'
  );

-- Step 3 · verify (informational · no schema mutation)
-- Expected post-state in `agents` for competitive variants:
--   competitive_intelligence_agent  · imported (Sonnet, 488 chars) · pre-existing orphan
--                                      drift (underscore vs canonical hyphen) · NOT
--                                      modified by this migration · resolved at runtime
--                                      via agent-alias-map.ts (`competitive_intelligence_agent
--                                      → competitive-intelligence-agent`).
--   competitive-intelligence-agent  · canonical seed (Opus, 6378 chars) · added here.

COMMIT;
