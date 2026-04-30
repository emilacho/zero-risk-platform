-- ============================================================================
-- Migration: 202604300001_rls_multi_tenant_client_brain_snapshots
-- Purpose: Replace permissive 'authenticated_read' RLS policy on public.client_brain_snapshots
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
ALTER TABLE public.client_brain_snapshots ENABLE ROW LEVEL SECURITY;

-- 2. Drop the legacy permissive policies (multiple legacy names possible)
DROP POLICY IF EXISTS "authenticated_read" ON public.client_brain_snapshots;
DROP POLICY IF EXISTS "authenticated_read_client_brain_snapshots" ON public.client_brain_snapshots;

-- 3. Re-assert service_role bypass (Mission Control + n8n + backend admin)
DROP POLICY IF EXISTS "service_role_all" ON public.client_brain_snapshots;
CREATE POLICY "service_role_all" ON public.client_brain_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Strict per-client SELECT (read isolation)
DROP POLICY IF EXISTS "client_isolation_client_brain_snapshots_select" ON public.client_brain_snapshots;
CREATE POLICY "client_isolation_client_brain_snapshots_select" ON public.client_brain_snapshots
  FOR SELECT
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')
  );

-- 5. Strict per-client INSERT (write isolation · prevents cross-tenant inserts)
DROP POLICY IF EXISTS "client_isolation_client_brain_snapshots_insert" ON public.client_brain_snapshots;
CREATE POLICY "client_isolation_client_brain_snapshots_insert" ON public.client_brain_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')
  );

-- 6. Strict per-client UPDATE (in-place mutation isolation · both USING and CHECK)
DROP POLICY IF EXISTS "client_isolation_client_brain_snapshots_update" ON public.client_brain_snapshots;
CREATE POLICY "client_isolation_client_brain_snapshots_update" ON public.client_brain_snapshots
  FOR UPDATE
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')
  )
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')
  );

-- 7. Strict per-client DELETE
DROP POLICY IF EXISTS "client_isolation_client_brain_snapshots_delete" ON public.client_brain_snapshots;
CREATE POLICY "client_isolation_client_brain_snapshots_delete" ON public.client_brain_snapshots
  FOR DELETE
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')
  );

-- 8. Document policy intent on the table itself for future operators
COMMENT ON TABLE public.client_brain_snapshots IS
  'Multi-tenant RLS-isolated by client_id (text). Authenticated users only see rows matching JWT claim ''client_id''. Service role bypasses for backend / n8n / Mission Control. See docs/05-orquestacion/RLS_MULTI_TENANT_GUIDE.md.';

-- ============================================================================
-- ROLLBACK (emergency only · re-grants broad authenticated_read · run as superuser)
-- ============================================================================
-- DROP POLICY IF EXISTS "client_isolation_client_brain_snapshots_select" ON public.client_brain_snapshots;
-- DROP POLICY IF EXISTS "client_isolation_client_brain_snapshots_insert" ON public.client_brain_snapshots;
-- DROP POLICY IF EXISTS "client_isolation_client_brain_snapshots_update" ON public.client_brain_snapshots;
-- DROP POLICY IF EXISTS "client_isolation_client_brain_snapshots_delete" ON public.client_brain_snapshots;
-- CREATE POLICY "authenticated_read" ON public.client_brain_snapshots
--   FOR SELECT TO authenticated USING (true);
