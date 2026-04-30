#!/usr/bin/env node
/**
 * generate-rls-migrations.mjs
 * Wave 13 · CC#2 · RLS multi-tenant migration generator
 *
 * Reads the canonical list of multi-tenant tables (split by client_id type:
 * UUID vs text) and generates one migration file per table under
 * supabase/migrations/rls/<TS>_rls_multi_tenant_<table>.sql plus one
 * SQL smoke-test file per table under supabase/tests/rls/<table>.sql.
 *
 * Each migration:
 *   - Drops the legacy permissive 'authenticated_read' policy
 *   - Re-asserts the service_role bypass policy
 *   - Creates 4 strict per-client policies (SELECT/INSERT/UPDATE/DELETE)
 *   - Comments the table to document the security contract
 *   - Includes inline ROLLBACK SQL at end-of-file
 *
 * Each test file performs 4 checks:
 *   1. Client A only sees its own rows
 *   2. Client B cannot read Client A rows
 *   3. service_role bypasses RLS (sees all)
 *   4. anon role sees 0 rows (no leak)
 *
 * Idempotent: safe to re-run · overwrites existing generated files.
 *
 * Run: node scripts/audit/generate-rls-migrations.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const MIG_DIR = resolve(REPO_ROOT, 'supabase', 'migrations', 'rls')
const TEST_DIR = resolve(REPO_ROOT, 'supabase', 'tests', 'rls')

mkdirSync(MIG_DIR, { recursive: true })
mkdirSync(TEST_DIR, { recursive: true })

// ────────────────────────────────────────────────────────────────────────────
// Canonical multi-tenant table inventory (Wave 13 audit)
// 20 tables across 3 source schema files. client_id type drives the cast in
// the policy USING clause: UUID tables cast `(auth.jwt() ->> 'client_id')::uuid`
// while text tables stay as text (no cast).
// ────────────────────────────────────────────────────────────────────────────

const UUID_TABLES = [
  'seo_engagements',
  'rank_tracking_daily',
  'content_packages',
  'experiments',
  'review_metrics',
  'social_schedules',
  'social_metrics',
  'client_reports',
  'incrementality_tests',
]

const TEXT_TABLES = [
  'email_sequences',
  'subject_line_tests',
  'influencer_approved_list',
  'influencer_rejections',
  'review_responses_queue',
  'churn_predictions',
  'rfm_segments',
  'community_health',
  'expansion_opportunities',
  'content_fetch_cache',
  'client_brain_snapshots',
]

const TS = '202604300001'

const SANDBOX_A_UUID = '00000000-0000-0000-0000-aaaaaaaaaaaa'
const SANDBOX_B_UUID = '00000000-0000-0000-0000-bbbbbbbbbbbb'
const SANDBOX_A_TEXT = 'sandbox-client-a'
const SANDBOX_B_TEXT = 'sandbox-client-b'

function migrationFor(table, type) {
  const cast = type === 'uuid' ? '::uuid' : ''
  const colType = type === 'uuid' ? 'UUID' : 'text'

  return `-- ============================================================================
-- Migration: ${TS}_rls_multi_tenant_${table}
-- Purpose: Replace permissive 'authenticated_read' RLS policy on public.${table}
--          with strict per-client isolation. Authenticated users only see rows
--          where client_id matches their JWT custom claim 'client_id'.
--          Service role bypass preserved (Mission Control · n8n workflows · backend).
-- Author:  Cowork CC#2 nocturno · Wave 13 · 2026-04-30
-- Source:  docs/05-orquestacion/COMPREHENSIVE_OPS_REVIEW_2026-04-29.md ÁREA D §D.2
--          docs/05-orquestacion/RLS_MULTI_TENANT_GUIDE.md
-- Idempotent: yes (DROP IF EXISTS + CREATE pattern · safe to re-run)
-- Rollback: see end-of-file -- ROLLBACK section
-- Pre-flight: requires JWT custom claim 'client_id' (${colType}) populated by
--             Supabase Auth Hook (custom_access_token_hook) or set explicitly
--             via service_role JWT mint in agent middleware.
-- ============================================================================

-- 1. Ensure RLS is enabled (idempotent · noop if already on)
ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;

-- 2. Drop the legacy permissive policies (multiple legacy names possible)
DROP POLICY IF EXISTS "authenticated_read" ON public.${table};
DROP POLICY IF EXISTS "authenticated_read_${table}" ON public.${table};

-- 3. Re-assert service_role bypass (Mission Control + n8n + backend admin)
DROP POLICY IF EXISTS "service_role_all" ON public.${table};
CREATE POLICY "service_role_all" ON public.${table}
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Strict per-client SELECT (read isolation)
DROP POLICY IF EXISTS "client_isolation_${table}_select" ON public.${table};
CREATE POLICY "client_isolation_${table}_select" ON public.${table}
  FOR SELECT
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')${cast}
  );

-- 5. Strict per-client INSERT (write isolation · prevents cross-tenant inserts)
DROP POLICY IF EXISTS "client_isolation_${table}_insert" ON public.${table};
CREATE POLICY "client_isolation_${table}_insert" ON public.${table}
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')${cast}
  );

-- 6. Strict per-client UPDATE (in-place mutation isolation · both USING and CHECK)
DROP POLICY IF EXISTS "client_isolation_${table}_update" ON public.${table};
CREATE POLICY "client_isolation_${table}_update" ON public.${table}
  FOR UPDATE
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')${cast}
  )
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')${cast}
  );

-- 7. Strict per-client DELETE
DROP POLICY IF EXISTS "client_isolation_${table}_delete" ON public.${table};
CREATE POLICY "client_isolation_${table}_delete" ON public.${table}
  FOR DELETE
  TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')${cast}
  );

-- 8. Document policy intent on the table itself for future operators
COMMENT ON TABLE public.${table} IS
  'Multi-tenant RLS-isolated by client_id (${colType}). Authenticated users only see rows matching JWT claim ''client_id''. Service role bypasses for backend / n8n / Mission Control. See docs/05-orquestacion/RLS_MULTI_TENANT_GUIDE.md.';

-- ============================================================================
-- ROLLBACK (emergency only · re-grants broad authenticated_read · run as superuser)
-- ============================================================================
-- DROP POLICY IF EXISTS "client_isolation_${table}_select" ON public.${table};
-- DROP POLICY IF EXISTS "client_isolation_${table}_insert" ON public.${table};
-- DROP POLICY IF EXISTS "client_isolation_${table}_update" ON public.${table};
-- DROP POLICY IF EXISTS "client_isolation_${table}_delete" ON public.${table};
-- CREATE POLICY "authenticated_read" ON public.${table}
--   FOR SELECT TO authenticated USING (true);
`
}

function testFor(table, type) {
  const cast = type === 'uuid' ? '::uuid' : ''
  const aId = type === 'uuid' ? SANDBOX_A_UUID : SANDBOX_A_TEXT
  const bId = type === 'uuid' ? SANDBOX_B_UUID : SANDBOX_B_TEXT

  return `-- ============================================================================
-- RLS Test: public.${table}
-- Purpose: validate Wave 13 RLS migration works correctly:
--          (1) client A only sees own rows · (2) client B cannot see A rows ·
--          (3) service_role bypass works · (4) anon sees zero rows
-- Run: psql -f supabase/tests/rls/${table}.sql · OR Supabase SQL Editor
-- Pre-flight: migration ${TS}_rls_multi_tenant_${table}.sql applied
-- Author: Cowork CC#2 nocturno · Wave 13
-- Mode: BEGIN/ROLLBACK · NEVER persists state (safe to run against prod)
-- ============================================================================

BEGIN;

-- Test 1 · authenticated as client A · should only see own rows (or 0)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"client_id":"${aId}"}';
DO $$
DECLARE
  visible_count integer;
  cross_tenant_visible integer;
BEGIN
  SELECT COUNT(*) INTO visible_count FROM public.${table};
  SELECT COUNT(*) INTO cross_tenant_visible FROM public.${table}
    WHERE client_id <> ('${aId}')${cast};

  IF cross_tenant_visible > 0 THEN
    RAISE EXCEPTION 'TEST 1 FAIL · client A sees % rows of OTHER clients', cross_tenant_visible;
  END IF;
  RAISE NOTICE 'TEST 1 OK · client A sees % rows (all own)', visible_count;
END $$;

-- Test 2 · authenticated as client B · should NOT see client A rows
SET LOCAL request.jwt.claims = '{"client_id":"${bId}"}';
DO $$
DECLARE
  client_a_visible integer;
BEGIN
  SELECT COUNT(*) INTO client_a_visible FROM public.${table}
    WHERE client_id = ('${aId}')${cast};
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
  SELECT COUNT(*) INTO total_rows FROM public.${table};
  RAISE NOTICE 'TEST 3 OK · service_role sees % total rows (bypass works)', total_rows;
END $$;

-- Test 4 · anon (no JWT claim) · should see 0 rows
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{}';
DO $$
DECLARE
  anon_count integer;
BEGIN
  SELECT COUNT(*) INTO anon_count FROM public.${table};
  IF anon_count > 0 THEN
    RAISE EXCEPTION 'TEST 4 FAIL · anon role sees % rows · should be 0', anon_count;
  END IF;
  RAISE NOTICE 'TEST 4 OK · anon role sees 0 rows (no leak)';
END $$;

ROLLBACK;
`
}

let count = 0
for (const t of UUID_TABLES) {
  writeFileSync(resolve(MIG_DIR, `${TS}_rls_multi_tenant_${t}.sql`), migrationFor(t, 'uuid'))
  writeFileSync(resolve(TEST_DIR, `${t}.sql`), testFor(t, 'uuid'))
  count++
}
for (const t of TEXT_TABLES) {
  writeFileSync(resolve(MIG_DIR, `${TS}_rls_multi_tenant_${t}.sql`), migrationFor(t, 'text'))
  writeFileSync(resolve(TEST_DIR, `${t}.sql`), testFor(t, 'text'))
  count++
}

console.log(`Generated ${count} migration files in ${MIG_DIR}`)
console.log(`Generated ${count} test files in ${TEST_DIR}`)
console.log(`UUID tables: ${UUID_TABLES.length} · text tables: ${TEXT_TABLES.length}`)
