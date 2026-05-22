-- Sprint 7.5 B6 · Observability fix · `agent_invocations.system_prompt`
--
-- Adds a text column to capture the EXACT system prompt sent to the model
-- on every agent invocation. Without this column, retroactive auditing of
-- whether Client Brain enrichment actually injected context is impossible
-- (CC#4 Pilar 2 investigation 2026-05-22 hit this gap explicitly).
--
-- Storage cost · pgsql text is unlimited but indexed via brin if needed
-- post-Sprint-7.5. Typical system prompt size · 2-15 KB (identity + skills +
-- guardrails + brain chunks). 131 rows current · projection 10K rows/year
-- means ~150 MB · negligible.
--
-- Reader privacy · system_prompt may contain client brand secrets · ensure
-- RLS limits select to service_role only. The default RLS for
-- agent_invocations already restricts to service_role (per migration
-- 202605140001_agent_invocations_daily_rollup.sql). No new policy needed.
--
-- Backfill · NOT possible · prior invocations never logged this content.
-- Forward-only · post-deploy the agent-sdk-runner.ts update kicks in for
-- every new invocation. Older rows stay NULL (acceptable · they pre-date
-- the audit canon).
--
-- Idempotent · safe to re-run · uses IF NOT EXISTS.

ALTER TABLE public.agent_invocations
  ADD COLUMN IF NOT EXISTS system_prompt text;

COMMENT ON COLUMN public.agent_invocations.system_prompt IS
  'Sprint 7.5 B6 · exact system prompt sent to the model on this invocation. NULL for pre-2026-05-22 rows (predates instrumentation). Used to audit Client Brain enrichment + agent identity drift retroactively.';

-- Optional · BRIN index for time-based queries (e.g. "show me last 100
-- prompts for client X"). NOT created here · only add when query pattern
-- proven · BRIN works well for append-mostly tables but adds write cost.
-- Leave as TODO comment for future canon decision.
--
-- CREATE INDEX IF NOT EXISTS idx_agent_invocations_started_at_brin
--   ON public.agent_invocations USING BRIN (started_at);
