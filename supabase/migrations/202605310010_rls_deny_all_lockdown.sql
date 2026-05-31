-- =====================================================================
-- Migration · RLS deny-all lockdown · cerrar exposición anon canon canonical
-- Spec · spec-CC1-RLS-remediation-lockdown.md · APROBADO Emilio §144 2026-05-31
-- UPDATE 2026-05-31 EOD · CIC#2 cerró hilo Realtime · NINGUNA de las 14 está
--   en supabase_realtime publication (solo loyalty_balance · que NO está en
--   las 14 · y agent_invocations ya tiene RLS=true). → canon canonical SIN
--   excepción anon-SELECT · cero impacto Realtime.
-- Approach Opus batch 10 · RLS-deny-all (NO REVOKE ciego) · service_role bypasea
-- Evidence · RESULTS-CIC2-RLS-advisor-evidence-2026-05-31.md
-- Canon · §144 admin gerencial · §148 honest reporting · §9.3 resuelve 2 de 5
-- =====================================================================
--
-- IMPACTO canon canonical ·
-- - 14 tablas sin RLS hoy → RLS ENABLE deny-all (sin política · anon/auth
--   denegados · service_role bypasea)
-- - SIN excepción canon canonical · agent_invocations YA tiene RLS=true ·
--   separate concern · loyalty_balance OUT-OF-SCOPE
-- - 5 vistas SECURITY DEFINER → SECURITY INVOKER (respetan RLS subyacente)
-- - REVOKE INSERT/UPDATE/DELETE/TRUNCATE de anon en las 14 (cinturón-y-
--   tiradores sobre RLS)
--
-- HONEST §148 · service_role bypasea RLS canon canonical Supabase default ·
-- backend con SUPABASE_SERVICE_ROLE_KEY sigue funcionando idéntico post-
-- migration. Vercel frontend con NEXT_PUBLIC_SUPABASE_ANON_KEY canon canonical
-- pierde read/write a las 14 tablas · cero impacto Realtime (publication NO
-- incluye ninguna de las 14 · CIC#2 verificó pg_publication_tables).
--
-- IDEMPOTENT canon canonical · `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` es
-- no-op si RLS ya enabled · REVOKE es idempotent · ALTER VIEW SET es idempotent.
--
-- REVERSIBLE canon canonical · downgrade SQL commented al final canónica ·
-- revertir en orden inverso · restaura state pre-migration.
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1 · RLS ENABLE deny-all canon canonical · 14 tablas · SIN excepción
-- ----------------------------------------------------------------------
-- Pattern canónico · ALTER TABLE ENABLE ROW LEVEL SECURITY sin CREATE POLICY ·
-- comportamiento Postgres canon · anon/authenticated denegados (NO match policy) ·
-- service_role bypasea automático (canon canonical Supabase default).

ALTER TABLE public.client_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rank_tracking_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_metrics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_engagements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_metrics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_schedules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_checkpoints    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_deliverables        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.websites                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_agents_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings                ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------
-- 2 · Vistas SECURITY DEFINER → SECURITY INVOKER canon canonical
-- ----------------------------------------------------------------------
-- 5 vistas canon · §9.3 decisión 2 · SECURITY INVOKER respeta RLS de tablas
-- subyacentes (anon ya no ve client_id+client_name vía active_journeys).
-- Postgres 15+ syntax canon · ALTER VIEW ... SET (security_invoker = true) ·
-- Supabase Pro corre PG 15+ desde 2024 canon canonical.

ALTER VIEW public.active_journeys        SET (security_invoker = true);
ALTER VIEW public.v_hitl_inbox           SET (security_invoker = true);
ALTER VIEW public.v_active_pipelines     SET (security_invoker = true);
ALTER VIEW public.v_agent_scorecards     SET (security_invoker = true);
ALTER VIEW public.v_pending_improvements SET (security_invoker = true);

COMMENT ON VIEW public.active_journeys IS
  'Spec spec-CC1-RLS-remediation-lockdown.md · canon §9.3 decisión 2 · SECURITY INVOKER · respeta RLS tablas subyacentes';

-- ----------------------------------------------------------------------
-- 3 · REVOKE writes anon canon canonical · cinturón-y-tiradores sobre RLS
-- ----------------------------------------------------------------------
-- Defense-in-depth · si alguna política futura permitiera SELECT anon por error ·
-- los writes anon NO matchearían ningún grant residual. service_role + authenticated
-- conservan grants existentes (canon canonical backend intacto).
--
-- NO revocar SELECT canon canonical · (a) deja la puerta cerrada vía RLS (sin
-- política = denegado), (b) Supabase PostgREST necesita SELECT grant para listar
-- tablas en schema endpoint discovery (canon canonical default behavior).
--
-- agent_invocations NO incluida canon canonical · separate concern (RLS ya
-- habilitado pre-existing · sus grants se manejan en migration propia).

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_reports          FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.content_packages        FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.experiments             FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rank_tracking_daily     FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.review_metrics          FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.seo_engagements         FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.social_metrics          FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.social_schedules        FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.workflow_checkpoints    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.seo_deliverables        FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.analytics               FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.websites                FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.managed_agents_registry FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.settings                FROM anon;

-- ----------------------------------------------------------------------
-- 4 · Audit comment canon canonical
-- ----------------------------------------------------------------------
COMMENT ON SCHEMA public IS
  'Sprint 11 Ola 1 · RLS deny-all lockdown shipped 2026-05-31 (CC#1 dispatch · spec-CC1-RLS-remediation-lockdown.md) · 14 tablas RLS-on SIN excepción anon · 5 views SECURITY INVOKER · REVOKE writes anon defense-in-depth · canon §148 honest + §9.3 cierra 2/5 · CIC#2 update · agent_invocations + loyalty_balance OUT-OF-SCOPE separate concerns';

-- =====================================================================
-- DOWNGRADE canon canonical (commented · usar SOLO si Emilio §144 explicit OK)
-- =====================================================================
-- ALTER TABLE public.client_reports          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.content_packages        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.experiments             DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.rank_tracking_daily     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.review_metrics          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.seo_engagements         DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.social_metrics          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.social_schedules        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.workflow_checkpoints    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.seo_deliverables        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.analytics               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.websites                DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.managed_agents_registry DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.settings                DISABLE ROW LEVEL SECURITY;
-- ALTER VIEW public.active_journeys          SET (security_invoker = false);
-- ALTER VIEW public.v_hitl_inbox             SET (security_invoker = false);
-- ALTER VIEW public.v_active_pipelines       SET (security_invoker = false);
-- ALTER VIEW public.v_agent_scorecards       SET (security_invoker = false);
-- ALTER VIEW public.v_pending_improvements   SET (security_invoker = false);
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.client_reports TO anon;
-- (... repetir para las 14 ...)
