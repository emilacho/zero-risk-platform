-- Migration · client_tasks · 2026-05-20 Sprint 3 D4
--
-- Per CC#2 dispatch CC2-SPRINT3-DAY1-4-CALCOM-SELFHOST-SUPABASE-MIGRATIONS ·
-- tenant_id + RLS canon multi-tenant. Single-tenant compat via
-- DEFAULT 'zero-risk-default' on tenant_id column.
--
-- Multi-tenant design decisions (CC#2 · awaiting Emilio post-merge review):
--   - tenant_id TEXT NOT NULL DEFAULT 'zero-risk-default' (forward-compat
--     with multi-tenant SaaS Fase 2 · existing data auto-scoped)
--   - RLS policies · service_role bypass + authenticated.jwt->'tenant_id'
--     matches row.tenant_id (when JWT claim present · else no access)
--   - NO separate organizations table this migration · scope minimal
--     (organizations can be added Fase 2 with tenant_id → organization.slug FK)

BEGIN;

CREATE TABLE IF NOT EXISTS client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'zero-risk-default',
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','blocked','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','urgent')),
  assigned_to_agent TEXT,
  assigned_to_human TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_tasks_tenant ON client_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_client ON client_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_status ON client_tasks(status) WHERE status IN ('pending','in_progress','blocked');
CREATE INDEX IF NOT EXISTS idx_client_tasks_due ON client_tasks(due_date) WHERE status NOT IN ('completed','cancelled');

ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_tasks_service_role_all ON client_tasks
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY client_tasks_tenant_scoped_select ON client_tasks
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY client_tasks_tenant_scoped_insert ON client_tasks
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

CREATE POLICY client_tasks_tenant_scoped_update ON client_tasks
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'))
  WITH CHECK (tenant_id = COALESCE(auth.jwt() ->> 'tenant_id', 'zero-risk-default'));

COMMENT ON TABLE client_tasks IS 'Sprint 3 D4 · CC#2 · multi-tenant tasks per cliente · tenant_id text scope';

COMMIT;
