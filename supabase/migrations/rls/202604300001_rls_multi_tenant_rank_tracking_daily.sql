-- ============================================================================
-- Migration: 202604300001_rls_multi_tenant_rank_tracking_daily
-- Purpose: Replace permissive 'authenticated_read' RLS policy on public.rank_tracking_daily
--          with strict per-client isolation. Authenticated users only see rows
--          where client_id matches their JWT custom claim 'client_id'.
--          Service role bypass preserved (Mission Control · n8n workflows · backend).
-- Author:  Cowork CC#2 nocturno · Wave 13 · 2026-04-30
-- Source:  docs/05-orquestacion/COMPREHENSIVE_OPS_REVIEW_2026-04-29.md ÁREA D §D.2
--          docs/05-orquestacion/RLS_MULTI_TENANT_GUIDE.md
-- Idempotent: yes (DROP IF EXISTS + CREATE pattern · safe to re-run)
-- Rollback: see end-of-file -- ROLLBACK section
-- Pre-flight: requires JWT custom claim 'client_id' (UUID) populated by
--             Supabase Auth Hook (custom_access_token_hook) or set explicitly
--             via service_role JWT mint in agent middleware.
-- ============================================================================

-- 1. Ensure RLS is enabled (idempotent · noop if already on)
ALTER TABLE public.rank_tracking_daily ENABLE ROW LEVEL SECURITY;

-- 2. Drop the legacy permissive policies (multiple legacy names possible)
DROP POLICY IF EXISTS "authenticated_read" ON public.rank_tracking_daily;
DROP POLICY IF EXISTS "authenticated_read_rank_tracking_daily" ON public.rank_tracking_daily;

-- 3. Re-assert service_role bypass (Mission Control + n8n + backend admin)
DROP POLICY IF EXISTS "service_role_all" ON public.rank_tracking_daily;
CREATE POLICY "service_role_all" ON public.rank_tracking_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Strict per-client SELECT (read isolation)
DROP POLICY IF EXISTS "client_isolation_rank_tracking_daily_select" ON public.rank_tracking_daily;
CREATE POLICY "client_isolation_rank_tracking_daily_select" ON public.rank_tracking_daily
  FOR SELECT
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')::uuid
  );

-- 5. Strict per-client INSERT (write isolation · prevents cross-tenant inserts)
DROP POLICY IF EXISTS "client_isolation_rank_tracking_daily_insert" ON public.rank_tracking_daily;
CREATE POLICY "client_isolation_rank_tracking_daily_insert" ON public.rank_tracking_daily
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')::uuid
  );

-- 6. Strict per-client UPDATE (in-place mutation isolation · both USING and CHECK)
DROP POLICY IF EXISTS "client_isolation_rank_tracking_daily_update" ON public.rank_tracking_daily;
CREATE POLICY "client_isolation_rank_tracking_daily_update" ON public.rank_tracking_daily
  FOR UPDATE
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')::uuid
  )
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')::uuid
  );

-- 7. Strict per-client DELETE
DROP POLICY IF EXISTS "client_isolation_rank_tracking_daily_delete" ON public.rank_tracking_daily;
CREATE POLICY "client_isolation_rank_tracking_daily_delete" ON public.rank_tracking_daily
  FOR DELETE
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')::uuid
  );

-- 8. Document policy intent on the table itself for future operators
COMMENT ON TABLE public.rank_tracking_daily IS
  'Multi-tenant RLS-isolated by client_id (UUID). Authenticated users only see rows matching JWT claim ''client_id''. Service role bypasses for backend / n8n / Mission Control. See docs/05-orquestacion/RLS_MULTI_TENANT_GUIDE.md.';

-- ============================================================================
-- ROLLBACK (emergency only · re-grants broad authenticated_read · run as superuser)
-- ============================================================================
-- DROP POLICY IF EXISTS "client_isolation_rank_tracking_daily_select" ON public.rank_tracking_daily;
-- DROP POLICY IF EXISTS "client_isolation_rank_tracking_daily_insert" ON public.rank_tracking_daily;
-- DROP POLICY IF EXISTS "client_isolation_rank_tracking_daily_update" ON public.rank_tracking_daily;
-- DROP POLICY IF EXISTS "client_isolation_rank_tracking_daily_delete" ON public.rank_tracking_daily;
-- CREATE POLICY "authenticated_read" ON public.rank_tracking_daily
--   FOR SELECT TO authenticated USING (true);
