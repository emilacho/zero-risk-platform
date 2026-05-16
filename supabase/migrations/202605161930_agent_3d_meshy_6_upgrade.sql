-- Sprint #6 Brazo Meshy follow-up · meshy-4 → meshy-6 model upgrade
--
-- Driver · post-merge smoke fire returned 400 from Meshy:
-- "meshy-4 is deprecated, please use meshy-6 instead". Direct probe with
-- meshy-6 returned 202 + task UUID · model upgrade is the fix.
--
-- This migration:
--   1. ALTERs `agent_3d_generations.model` default from `meshy-4` to `meshy-6`
--   2. Idempotent · safe to re-run

BEGIN;

ALTER TABLE agent_3d_generations
  ALTER COLUMN model SET DEFAULT 'meshy-6';

COMMIT;
