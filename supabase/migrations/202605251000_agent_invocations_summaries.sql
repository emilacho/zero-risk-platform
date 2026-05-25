-- Sprint 8D · Transparency enhancement · agent_invocations input/output summaries
--
-- Adds canonical input_summary + output_summary columns to enable forensics deep
-- self-contained · NO cross-reference n8n exec data needed. Per gastos forensics
-- deep audit (raw/qa/2026-05-25-gastos-forensics-per-invocacion-deep.md) ·
-- agent_invocations table currently has only task_text 200-char preview en
-- metadata jsonb · insufficient for per-invocation who/what/why trace post-hoc.
--
-- Canonical truncation 2000 chars + ellipsis preserves storage budget · full
-- payloads viven en Anthropic logs (Anthropic console retention canonical).
--
-- Idempotent · IF NOT EXISTS semantics. Forward-only · historic rows quedan con
-- NULL summaries (backfill Sprint 9 candidate optional desde n8n exec data si
-- retention available).

BEGIN;

ALTER TABLE agent_invocations
  ADD COLUMN IF NOT EXISTS input_summary text,
  ADD COLUMN IF NOT EXISTS output_summary text;

COMMENT ON COLUMN agent_invocations.input_summary IS
  'Sprint 8D · truncated input prompt summary · max 2000 chars + ellipsis · canonical forensics deep self-contained · NULL para historic rows pre-migration';

COMMENT ON COLUMN agent_invocations.output_summary IS
  'Sprint 8D · truncated output response summary · max 2000 chars + ellipsis · canonical forensics deep self-contained · NULL para historic rows pre-migration';

COMMIT;
