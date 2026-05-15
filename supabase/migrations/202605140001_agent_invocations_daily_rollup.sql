-- Sprint #5 Item 4 (CC#1) · agent_invocations daily rollup materialized view
--
-- Driver · agent_invocations grows ~10-50k rows/month at planned scale (10-30
-- sessions/day per agent across 15+ agents). The hot dashboard queries
-- (/agents/stats, /costs) hit costs_breakdown, costs_timeline, and
-- agent_stats_mini_batch RPCs which scan rows · ROUTINE-acceptable today (<1k
-- rows) but degrades past 50k. This MV pre-aggregates daily stats per
-- (day, agent_id, model) so dashboard queries fall back to MV scans (<100ms).
--
-- Pre-aggregations match the columns the existing RPCs return so a future
-- query rewrite can swap MV in transparently.
--
-- Refresh strategy · REFRESH MATERIALIZED VIEW CONCURRENTLY on a schedule.
-- Concurrent refresh requires a unique index on the view. Schedule mechanism
-- (pg_cron vs n8n) is decided in companion CC#1 work item. Initial cadence:
-- every 15 min covers the "near-real-time on dashboard" UX without thrashing
-- write contention. Refresh CONCURRENTLY doesn't block readers.
--
-- COALESCE on model ensures the unique index works (NULL would block uniqueness).

CREATE MATERIALIZED VIEW IF NOT EXISTS agent_invocations_daily_rollup AS
SELECT
  (date_trunc('day', started_at AT TIME ZONE 'UTC'))::DATE AS day,
  agent_id,
  COALESCE(model, 'unknown') AS model,
  COUNT(*)::BIGINT AS invocations_count,
  COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS success_count,
  COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS error_count,
  COUNT(*) FILTER (WHERE status = 'timeout')::BIGINT AS timeout_count,
  ROUND(COALESCE(SUM(cost_usd), 0)::numeric, 4) AS total_cost_usd,
  ROUND(COALESCE(AVG(cost_usd), 0)::numeric, 6) AS avg_cost_usd,
  ROUND(COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY cost_usd), 0)::numeric, 6) AS p50_cost_usd,
  ROUND(COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY cost_usd), 0)::numeric, 6) AS p95_cost_usd,
  ROUND(COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY cost_usd), 0)::numeric, 6) AS p99_cost_usd,
  COALESCE(SUM(tokens_input), 0)::BIGINT AS total_tokens_input,
  COALESCE(SUM(tokens_output), 0)::BIGINT AS total_tokens_output,
  COALESCE(SUM(tokens_cache_read), 0)::BIGINT AS total_tokens_cache_read,
  COALESCE(SUM(tokens_cache_creation), 0)::BIGINT AS total_tokens_cache_creation,
  ROUND(COALESCE(AVG(duration_ms), 0)::numeric, 0)::BIGINT AS avg_duration_ms,
  ROUND(COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms), 0)::numeric, 0)::BIGINT AS p50_duration_ms,
  ROUND(COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::numeric, 0)::BIGINT AS p95_duration_ms,
  ROUND(COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::numeric, 0)::BIGINT AS p99_duration_ms,
  COALESCE(MAX(duration_ms), 0)::BIGINT AS max_duration_ms,
  MIN(started_at) AS first_session_at,
  MAX(started_at) AS last_session_at,
  clock_timestamp() AS refreshed_at
FROM agent_invocations
GROUP BY 1, 2, 3
WITH NO DATA;

-- Unique index · required for REFRESH MATERIALIZED VIEW CONCURRENTLY · model
-- column is non-null thanks to COALESCE above.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_invocations_daily_rollup_unique
  ON agent_invocations_daily_rollup (day, agent_id, model);

-- Secondary indexes for common dashboard access patterns
CREATE INDEX IF NOT EXISTS idx_agent_invocations_daily_rollup_day
  ON agent_invocations_daily_rollup (day DESC);

CREATE INDEX IF NOT EXISTS idx_agent_invocations_daily_rollup_agent_day
  ON agent_invocations_daily_rollup (agent_id, day DESC);

-- Helper RPC · refresh the view + return refresh metadata · callable by
-- pg_cron or n8n cron workflow.
CREATE OR REPLACE FUNCTION refresh_agent_invocations_daily_rollup()
RETURNS TABLE (
  refreshed_at TIMESTAMPTZ,
  row_count BIGINT,
  duration_ms NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t_start TIMESTAMPTZ;
  t_end TIMESTAMPTZ;
  rc BIGINT;
BEGIN
  t_start := clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY agent_invocations_daily_rollup;
  t_end := clock_timestamp();
  SELECT COUNT(*) INTO rc FROM agent_invocations_daily_rollup;
  RETURN QUERY SELECT
    t_end,
    rc,
    ROUND(EXTRACT(EPOCH FROM (t_end - t_start)) * 1000)::numeric;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_agent_invocations_daily_rollup TO service_role;

-- Initial populate (will be empty if agent_invocations is empty · expected
-- during early Sprint #5 before daemon writes real rows · CC#1 Item 2 work).
REFRESH MATERIALIZED VIEW agent_invocations_daily_rollup;
