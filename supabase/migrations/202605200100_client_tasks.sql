-- Migration · client_tasks · 2026-05-20 Sprint 3 D4
-- Single-tenant canon enforced 2026-05-20 per Emilio decision (CLAUDE.md Stack clave V4)
-- RLS · service_role bypass + admin-only (app_roles.role = 'admin')

BEGIN;

CREATE TABLE IF NOT EXISTS client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX IF NOT EXISTS idx_client_tasks_client ON client_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_status ON client_tasks(status) WHERE status IN ('pending','in_progress','blocked');
CREATE INDEX IF NOT EXISTS idx_client_tasks_due ON client_tasks(due_date) WHERE status NOT IN ('completed','cancelled');

ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_tasks_service_role_all ON client_tasks
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY client_tasks_admin_full_access ON client_tasks
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE client_tasks IS 'Sprint 3 D4 · CC#2 · per-client tasks · single-tenant canon · admin-only RLS';

COMMIT;
