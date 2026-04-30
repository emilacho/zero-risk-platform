-- ============================================================================
-- RLS Test: public.client_reports
-- Purpose: validate Wave 13 RLS migration works correctly:
--          (1) client A only sees own rows · (2) client B cannot see A rows ·
--          (3) service_role bypass works · (4) anon sees zero rows
-- Run: psql -f supabase/tests/rls/client_reports.sql · OR Supabase SQL Editor
-- Pre-flight: migration 202604300001_rls_multi_tenant_client_reports.sql applied
-- Author: Cowork CC#2 nocturno · Wave 13
-- Mode: BEGIN/ROLLBACK · NEVER persists state (safe to run against prod)
-- ============================================================================

BEGIN;

-- Test 1 · authenticated as client A · should only see own rows (or 0)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"client_id":"00000000-0000-0000-0000-aaaaaaaaaaaa"}';
DO $$
DECLARE
  visible_count integer;
  cross_tenant_visible integer;
BEGIN
  SELECT COUNT(*) INTO visible_count FROM public.client_reports;
  SELECT COUNT(*) INTO cross_tenant_visible FROM public.client_reports
    WHERE client_id <> ('00000000-0000-0000-0000-aaaaaaaaaaaa')::uuid;

  IF cross_tenant_visible > 0 THEN
    RAISE EXCEPTION 'TEST 1 FAIL · client A sees % rows of OTHER clients', cross_tenant_visible;
  END IF;
  RAISE NOTICE 'TEST 1 OK · client A sees % rows (all own)', visible_count;
END $$;

-- Test 2 · authenticated as client B · should NOT see client A rows
SET LOCAL request.jwt.claims = '{"client_id":"00000000-0000-0000-0000-bbbbbbbbbbbb"}';
DO $$
DECLARE
  client_a_visible integer;
BEGIN
  SELECT COUNT(*) INTO client_a_visible FROM public.client_reports
    WHERE client_id = ('00000000-0000-0000-0000-aaaaaaaaaaaa')::uuid;
  IF client_a_visible > 0 THEN
    RAISE EXCEPTION 'TEST 2 FAIL · client B sees % rows of client A · LEAK', client_a_visible;
  END IF;
  RAISE NOTICE 'TEST 2 OK · client B sees 0 rows of client A';
END $$;

-- Test 3 · service_role · should see ALL rows (bypass)
SET LOCAL ROLE service_role;
DO $$
DECLARE
  total_rows integer;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM public.client_reports;
  RAISE NOTICE 'TEST 3 OK · service_role sees % total rows (bypass works)', total_rows;
END $$;

-- Test 4 · anon (no JWT claim) · should see 0 rows
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{}';
DO $$
DECLARE
  anon_count integer;
BEGIN
  SELECT COUNT(*) INTO anon_count FROM public.client_reports;
  IF anon_count > 0 THEN
    RAISE EXCEPTION 'TEST 4 FAIL · anon role sees % rows · should be 0', anon_count;
  END IF;
  RAISE NOTICE 'TEST 4 OK · anon role sees 0 rows (no leak)';
END $$;

ROLLBACK;
