-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration · G6 hardening · REVOKE open grants + ENABLE RLS              ║
-- ║                                                                          ║
-- ║ Sprint 12 Fase 0 · escalón 4 hardening · authored CC#1.                 ║
-- ║                                                                          ║
-- ║ Cierra el hallazgo §148 honest del escalón 4 ·                          ║
-- ║   "rate_limit_buckets quedó con permisos abiertos · relrowsecurity      ║
-- ║   = false · anon/authenticated tienen ALL privileges · increment_       ║
-- ║   bucket_atomic con EXECUTE granted a PUBLIC. A diferencia del          ║
-- ║   patrón canónico de sala_event_log (RLS + REVOKE anon/PUBLIC)."        ║
-- ║                                                                          ║
-- ║ Aplica el mismo patrón canon de sala_event_log §5 ·                     ║
-- ║   1. REVOKE ALL ON rate_limit_buckets FROM PUBLIC · anon · authenticated║
-- ║   2. REVOKE EXECUTE ON increment_bucket_atomic FROM PUBLIC · anon ·     ║
-- ║      authenticated · canon canon-conserva service_role + postgres       ║
-- ║   3. ENABLE ROW LEVEL SECURITY · sin POLICY · canon canon-deny-all      ║
-- ║      automático para roles sin BYPASSRLS                                ║
-- ║   4. Service_role tiene BYPASSRLS canónico Supabase · canon canon-      ║
-- ║      hook canon canon-canon-sigue funcionando · NO break frena-proof    ║
-- ║   5. RPC SECURITY DEFINER (declarado en #155) corre como owner          ║
-- ║      (postgres) · canon canon-bypassea RLS para los UPDATE atomicos     ║
-- ║                                                                          ║
-- ║ Reversibilidad · canon canon-canon-bloque rollback inline al pie ·      ║
-- ║ canon canon-vuelve al estado open · R10 compliant.                      ║
-- ║                                                                          ║
-- ║ Refs ·                                                                   ║
-- ║   - PR #155 (G6 migration apply original · escalón 4 §144)              ║
-- ║   - PR canon-canon-this · hallazgo §148 raw/qa/2026-06-04 escalón 4     ║
-- ║   - Canon sala_event_log §5 (PR #141 · pattern source-of-truth)         ║
-- ║   - SupabaseG6BudgetHook contract · src/lib/sala/g6/                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Pre-check · table + RPC MUST exist (PR #155 applied)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets'
  ) THEN
    RAISE EXCEPTION 'rate_limit_buckets missing · apply PR #155 (202606040001_g6_rate_limit_buckets.sql) first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_bucket_atomic'
  ) THEN
    RAISE EXCEPTION 'increment_bucket_atomic missing · apply PR #155 first';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · REVOKE table grants · canon sala_event_log §5 pattern
-- ─────────────────────────────────────────────────────────────────────────
-- canon canon · canon canon-canon-Supabase grants by default ALL to PUBLIC ·
-- anon · authenticated · service_role · postgres. Canon canon-the only
-- canon-roles we want to keep are service_role (RLS-bypass + hook caller)
-- canon-and postgres (owner · DDL). Canon canon-canonical-belt-and-
-- canon-suspenders · canon canon-RLS will deny-all below · this REVOKE
-- canon-removes the GRANT layer so even RLS-bypass attempts via role
-- canon-impersonation cannot reach the rows.

REVOKE ALL ON public.rate_limit_buckets FROM PUBLIC;
REVOKE ALL ON public.rate_limit_buckets FROM anon;
REVOKE ALL ON public.rate_limit_buckets FROM authenticated;

-- canon canon · service_role + postgres conservan grants (canon canonical
-- canon-Supabase defaults · canon-canon-NO los tocamos). El hook usa
-- canon-service_role · canon-canon-CRUD ops siguen funcionando.

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · REVOKE RPC EXECUTE · canon canonical-defense in depth
-- ─────────────────────────────────────────────────────────────────────────
-- canon canon · canon-canon-`increment_bucket_atomic` es SECURITY DEFINER ·
-- canon-canon-corre como owner (postgres) · canon-canon-canonical-cualquier
-- canon-rol con EXECUTE puede invocarlo + leer/escribir la tabla via la
-- canon-función · canon canon-restricting EXECUTE a service_role mantiene
-- canon-el blast-radius dentro del hook canónico.

REVOKE EXECUTE ON FUNCTION public.increment_bucket_atomic(text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_bucket_atomic(text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_bucket_atomic(text, numeric) FROM authenticated;

-- canon canon · service_role mantiene EXECUTE (granted en PR #155) · canon
-- canon-canon-postgres es owner · canon-canon-NO requiere grant explícito.

-- ─────────────────────────────────────────────────────────────────────────
-- 4 · ENABLE ROW LEVEL SECURITY · canon canon-sala_event_log §5 pattern
-- ─────────────────────────────────────────────────────────────────────────
-- canon canon · canon-canon-rate_limit_buckets canónica-NO tiene tenant_id
-- canon-(bucket_key opaque codifica el scope · canon-canonical "client:c-
-- canon-abc:..." o "global:..."). Canon canon-NO podemos hacer una policy
-- canon-tenant-scoped como sala_event_log. Canon canon-en su lugar ·
-- canon-canon-RLS ENABLED + sin policy = deny-all canónico para todos los
-- canon-roles sin BYPASSRLS. Canon canon-service_role tiene BYPASSRLS por
-- canon-default en Supabase · canon canon-el hook sigue funcionando. La
-- canon-RPC SECURITY DEFINER corre como owner (postgres) · canon-canon-
-- canon-bypassea RLS naturally. Doble seguro · canon canon-canonical.

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- canon canon · canon-canon-NO declarar policies = canon-canon-deny-all
-- canon-implícito a roles sin BYPASSRLS. Canon canon-si el wire del hook
-- canon-canon-evoluciona a usar authenticated directo (hoy no) · canon-
-- canon-añadir CREATE POLICY entonces.

-- ─────────────────────────────────────────────────────────────────────────
-- 5 · Post-check · canon-canonical-verify estado final
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_anon_table_grants BIGINT;
  v_authenticated_table_grants BIGINT;
  v_anon_rpc_grants BIGINT;
  v_authenticated_rpc_grants BIGINT;
  v_public_rpc_grants BIGINT;
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class
    WHERE relname = 'rate_limit_buckets'
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'post-check · RLS canon canon-NOT enabled on rate_limit_buckets';
  END IF;

  SELECT count(*) INTO v_anon_table_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets' AND grantee = 'anon';
  IF v_anon_table_grants > 0 THEN
    RAISE EXCEPTION 'post-check · anon canon canon-STILL has table grants (%)', v_anon_table_grants;
  END IF;

  SELECT count(*) INTO v_authenticated_table_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets' AND grantee = 'authenticated';
  IF v_authenticated_table_grants > 0 THEN
    RAISE EXCEPTION 'post-check · authenticated canon canon-STILL has table grants (%)', v_authenticated_table_grants;
  END IF;

  SELECT count(*) INTO v_anon_rpc_grants
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'increment_bucket_atomic' AND grantee = 'anon';
  SELECT count(*) INTO v_authenticated_rpc_grants
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'increment_bucket_atomic' AND grantee = 'authenticated';
  SELECT count(*) INTO v_public_rpc_grants
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'increment_bucket_atomic' AND grantee = 'PUBLIC';

  IF v_anon_rpc_grants > 0 OR v_authenticated_rpc_grants > 0 OR v_public_rpc_grants > 0 THEN
    RAISE EXCEPTION
      'post-check · RPC canon canon-STILL has open grants (anon=% · authenticated=% · PUBLIC=%)',
      v_anon_rpc_grants, v_authenticated_rpc_grants, v_public_rpc_grants;
  END IF;
END $$;

COMMIT;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ROLLBACK (canon canonical inline · run manually if needed · canon canon ║
-- ║ canon-canon-vuelve al estado open original de PR #155)                  ║
-- ║                                                                          ║
-- ║ BEGIN;                                                                   ║
-- ║   ALTER TABLE public.rate_limit_buckets DISABLE ROW LEVEL SECURITY;     ║
-- ║   GRANT ALL ON public.rate_limit_buckets TO anon;                        ║
-- ║   GRANT ALL ON public.rate_limit_buckets TO authenticated;               ║
-- ║   GRANT EXECUTE ON FUNCTION public.increment_bucket_atomic(text, numeric) TO PUBLIC; ║
-- ║   GRANT EXECUTE ON FUNCTION public.increment_bucket_atomic(text, numeric) TO anon; ║
-- ║   GRANT EXECUTE ON FUNCTION public.increment_bucket_atomic(text, numeric) TO authenticated; ║
-- ║ COMMIT;                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
