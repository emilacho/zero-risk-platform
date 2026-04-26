-- Zero Risk — MC Migration Schema
-- Reemplaza Mission Control (JSON files en Railway) con tablas Supabase persistentes.
-- Aplica en Supabase SQL Editor ANTES de correr scripts/migrate-mc.mjs
-- Fecha: 2026-04-26

-- ============================================================
-- 1. MISSION CONTROL TASKS (reemplaza MC /api/tasks)
--    Eisenhower Matrix + Kanban compatible con la estructura de MC
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
  -- Links to pipeline system
  pipeline_id TEXT REFERENCES pipeline_executions(id) ON DELETE SET NULL,
  step_index INTEGER,
  -- Source tracking
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'pipeline', 'n8n', 'import_mc')),
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mc_tasks_kanban ON mission_control_tasks(kanban);
CREATE INDEX IF NOT EXISTS idx_mc_tasks_pipeline ON mission_control_tasks(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_mc_tasks_importance_urgency ON mission_control_tasks(importance, urgency);

-- ============================================================
-- 2. MISSION CONTROL INBOX (reemplaza MC /api/inbox)
--    General notifications + approval inbox. Persistente y con acciones.
-- ============================================================
CREATE TABLE IF NOT EXISTS mission_control_inbox (
  id TEXT PRIMARY KEY DEFAULT 'msg_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6),
  -- Message content (MC-compatible field names)
  from_agent TEXT NOT NULL,
  to_role TEXT NOT NULL DEFAULT 'leader',
  type TEXT NOT NULL DEFAULT 'report'
    CHECK (type IN ('approval', 'report', 'update', 'error', 'delegation')),
  task_id TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Read/resolve state
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'resolved')),
  read_at TIMESTAMPTZ,
  -- HITL decision (when type=approval)
  decision TEXT CHECK (decision IN ('approved', 'rejected', 'acknowledged')),
  decision_notes TEXT,
  decided_by TEXT DEFAULT 'emilio',
  decided_at TIMESTAMPTZ,
  -- Link to HITL systems
  hitl_step_id TEXT,        -- pipeline_steps.id (System A)
  hitl_approval_id TEXT,    -- hitl_pending_approvals.item_id (System B)
  -- Source
  source TEXT DEFAULT 'platform' CHECK (source IN ('platform', 'n8n', 'pipeline', 'import_mc')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mc_inbox_type ON mission_control_inbox(type);
CREATE INDEX IF NOT EXISTS idx_mc_inbox_status ON mission_control_inbox(status);
CREATE INDEX IF NOT EXISTS idx_mc_inbox_created ON mission_control_inbox(created_at DESC);

-- ============================================================
-- 3. MISSION CONTROL PROJECTS (reemplaza MC /api/projects)
--    Proyectos + Goals + Milestones en Supabase
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
  -- Import tracking
  mc_id TEXT,  -- original MC project ID (para dedup en importación)
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'import_mc')),
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
