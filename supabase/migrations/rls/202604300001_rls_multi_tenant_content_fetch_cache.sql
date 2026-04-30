-- ============================================================================
-- Migration: 202604300001_rls_multi_tenant_content_fetch_cache
-- Purpose: Replace permissive 'authenticated_read' RLS policy on public.content_fetch_cache
--          with strict per-client isolation. Authenticated users only see rows
--          where client_id matches their JWT custom claim 'client_id'.
--          Service role bypass preserved (Mission Control · n8n workflows · backend).
-- Author:  Cowork CC#2 nocturno · Wave 13 · 2026-04-30
-- Source:  docs/05-orquestacion/COMPREHENSIVE_OPS_REVIEW_2026-04-29.md ÁREA D §D.2
--          docs/05-orquestacion/RLS_MULTI_TENANT_GUIDE.md
-- Idempotent: yes (DROP IF EXISTS + CREATE pattern · safe to re-run)
-- Rollback: see end-of-file -- ROLLBACK section
-- Pre-flight: requires JWT custom claim 'client_id' (text) populated by
--             Supabase Auth Hook (custom_access_token_hook) or set explicitly
--             via service_role JWT mint in agent middleware.
-- ============================================================================

-- 1. Ensure RLS is enabled (idempotent · noop if already on)
ALTER TABLE public.content_fetch_cache ENABLE ROW LEVEL SECURITY;

-- 2. Drop the legacy permissive policies (multiple legacy names possible)
DROP POLICY IF EXISTS "authenticated_read" ON public.content_fetch_cache;
DROP POLICY IF EXISTS "authenticated_read_content_fetch_cache" ON public.content_fetch_cache;

-- 3. Re-assert service_role bypass (Mission Control + n8n + backend admin)
DROP POLICY IF EXISTS "service_role_all" ON public.content_fetch_cache;
CREATE POLICY "service_role_all" ON public.content_fetch_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Strict per-client SELECT (read isolation)
DROP POLICY IF EXISTS "client_isolation_content_fetch_cache_select" ON public.content_fetch_cache;
CREATE POLICY "client_isolation_content_fetch_cache_select" ON public.content_fetch_cache
  FOR SELECT
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')
  );

-- 5. Strict per-client INSERT (write isolation · prevents cross-tenant inserts)
DROP POLICY IF EXISTS "client_isolation_content_fetch_cache_insert" ON public.content_fetch_cache;
CREATE POLICY "client_isolation_content_fetch_cache_insert" ON public.content_fetch_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')
  );

-- 6. Strict per-client UPDATE (in-place mutation isolation · both USING and CHECK)
DROP POLICY IF EXISTS "client_isolation_content_fetch_cache_update" ON public.content_fetch_cache;
CREATE POLICY "client_isolation_content_fetch_cache_update" ON public.content_fetch_cache
  FOR UPDATE
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')
  )
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')
  );

-- 7. Strict per-client DELETE
DROP POLICY IF EXISTS "client_isolation_content_fetch_cache_delete" ON public.content_fetch_cache;
CREATE POLICY "client_isolation_content_fetch_cache_delete" ON public.content_fetch_cache
  FOR DELETE
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')
  );

-- 8. Document policy intent on the table itself for future operators
COMMENT ON TABLE public.content_fetch_cache IS
  'Multi-tenant RLS-isolated by client_id (text). Authenticated users only see rows matching JWT claim ''client_id''. Service role bypasses for backend / n8n / Mission Control. See docs/05-orquestacion/RLS_MULTI_TENANT_GUIDE.md.';

-- ============================================================================
-- ROLLBACK (emergency only · re-grants broad authenticated_read · run as superuser)
-- ============================================================================
-- DROP POLICY IF EXISTS "client_isolation_content_fetch_cache_select" ON public.content_fetch_cache;
-- DROP POLICY IF EXISTS "client_isolation_content_fetch_cache_insert" ON public.content_fetch_cache;
-- DROP POLICY IF EXISTS "client_isolation_content_fetch_cache_update" ON public.content_fetch_cache;
-- DROP POLICY IF EXISTS "client_isolation_content_fetch_cache_delete" ON public.content_fetch_cache;
-- CREATE POLICY "authenticated_read" ON public.content_fetch_cache
--   FOR SELECT TO authenticated USING (true);
