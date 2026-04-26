-- Zero Risk — MC Migration Schema
-- Tablas Supabase para reemplazar Mission Control (JSON files en Railway) si Emilio decide migrar.
-- CÓDIGO DORMIDO — aplica solo cuando decidas migrar. No afecta producción hasta entonces.
--
-- Cómo usar:
--   1. Aplicar en Supabase SQL Editor
--   2. Correr: node scripts/migrate-mc.mjs --execute --verify
--   3. Elegir plataforma destino: node scripts/mc-portability/import-from-mc.mjs --adapter supabase
--
-- Fecha: 2026-04-26

-- ============================================================
-- 1. MISSION CONTROL TASKS (Eisenhower Matrix + Kanban)
-- ============================================================
CREATE TABLE IF NOT EXISTS mission_control_tasks (
  id TEXT PRIMARY KEY DEFAULT 'task_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6),
  title TEXT NOT NULL,
  description TEXT,
  importance TEXT NOT NULL DEFAULT 'not-important'
    CHECK (importance IN ('important', 'not-important')),
  urgency TEXT NOT NULL DEFAULT 'not-urgent'
    CHECK (urgency IN ('urgent', 'not-urgent')),
  kanban TEXT NOT NULL DEFAULT 'todo'
    CHECK (kanban IN ('todo', 'in-progress', 'done')),
  assigned_to TEXT,
  project_id TEXT,
  milestone_id TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  estimated_minutes INTEGER,
  pipeline_id TEXT,  -- link to pipeline_executions (no FK — tabla puede no existir aún)
  step_index INTEGER,
  source TEXT DEFAULT 'import_mc',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mc_tasks_kanban ON mission_control_tasks(kanban);
CREATE INDEX IF NOT EXISTS idx_mc_tasks_eisenhower ON mission_control_tasks(importance, urgency);

-- ============================================================
-- 2. MISSION CONTROL INBOX (notificaciones + approvals)
-- ============================================================
CREATE TABLE IF NOT EXISTS mission_control_inbox (
  id TEXT PRIMARY KEY DEFAULT 'msg_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6),
  from_agent TEXT NOT NULL,
  to_role TEXT NOT NULL DEFAULT 'leader',
  type TEXT NOT NULL DEFAULT 'report'
    CHECK (type IN ('approval', 'report', 'update', 'error', 'delegation')),
  task_id TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'resolved')),
  read_at TIMESTAMPTZ,
  decision TEXT CHECK (decision IN ('approved', 'rejected', 'acknowledged')),
  decision_notes TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  source TEXT DEFAULT 'import_mc',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mc_inbox_type ON mission_control_inbox(type);
CREATE INDEX IF NOT EXISTS idx_mc_inbox_status ON mission_control_inbox(status);
CREATE INDEX IF NOT EXISTS idx_mc_inbox_created ON mission_control_inbox(created_at DESC);

-- ============================================================
-- 3. MISSION CONTROL PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS mission_control_projects (
  id TEXT PRIMARY KEY DEFAULT 'proj_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  color TEXT DEFAULT '#6B7280',
  team_members TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  mc_id TEXT,
  source TEXT DEFAULT 'import_mc',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Trigger: updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION update_mc_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_mc_tasks_updated_at
    BEFORE UPDATE ON mission_control_tasks
    FOR EACH ROW EXECUTE FUNCTION update_mc_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_mc_projects_updated_at
    BEFORE UPDATE ON mission_control_projects
    FOR EACH ROW EXECUTE FUNCTION update_mc_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
