-- Sprint 7 A2 · seed 5 missing `agents` rows from `managed_agents_registry`.
-- Data hygiene per audit 2026-05-22 (vault qa doc 2026-05-21-sprint6-audit-agents-wired)
-- · canon dice `agents` IS source of truth at runtime · registry is fallback.
-- These 5 agents existed in registry but not in agents · runtime worked via
-- fallback but identity_content WRITE protocol (PR #27) requires agents row.
--
-- All 5 use provenance tag `project-local (sprint7-fill-missing-rows-2026-05-22) · ref managed_agents_registry`
-- per PROTOCOLO `agents.identity_content` WRITE.
--
-- Idempotent · ON CONFLICT (name) DO NOTHING (preserve any pre-existing row).
-- Role + department_id + model mapping per ARQUITECTURA section 4.1 categorization.

BEGIN;

-- ── 1. influencer-manager · Distribución y PR · empleado ───────────────────
INSERT INTO agents (
  name, display_name, role, department_id, model, identity_content,
  identity_source, status, created_at, updated_at
)
SELECT
  'influencer-manager',
  display_name,
  'empleado',
  '9e45ceeb-063f-44e8-9033-9897b6aa8428',  -- marketing
  CASE WHEN default_model = 'claude-haiku-4-5' THEN 'claude-haiku-4-5-20251001' ELSE default_model END,
  identity_md,
  'project-local (sprint7-fill-missing-rows-2026-05-22) · ref managed_agents_registry',
  'active',
  now(),
  now()
FROM managed_agents_registry
WHERE slug = 'influencer-manager'
ON CONFLICT (name) DO NOTHING;

-- ── 2. review-responder · Distribución y PR · empleado · haiku-4-5 suffix fix ─
INSERT INTO agents (
  name, display_name, role, department_id, model, identity_content,
  identity_source, status, created_at, updated_at
)
SELECT
  'review-responder',
  display_name,
  'empleado',
  '9e45ceeb-063f-44e8-9033-9897b6aa8428',  -- marketing
  CASE WHEN default_model = 'claude-haiku-4-5' THEN 'claude-haiku-4-5-20251001' ELSE default_model END,
  identity_md,
  'project-local (sprint7-fill-missing-rows-2026-05-22) · ref managed_agents_registry',
  'active',
  now(),
  now()
FROM managed_agents_registry
WHERE slug = 'review-responder'
ON CONFLICT (name) DO NOTHING;

-- ── 3. pr-earned-media-manager · Distribución y PR · empleado ──────────────
INSERT INTO agents (
  name, display_name, role, department_id, model, identity_content,
  identity_source, status, created_at, updated_at
)
SELECT
  'pr-earned-media-manager',
  display_name,
  'empleado',
  '9e45ceeb-063f-44e8-9033-9897b6aa8428',  -- marketing
  CASE WHEN default_model = 'claude-haiku-4-5' THEN 'claude-haiku-4-5-20251001' ELSE default_model END,
  identity_md,
  'project-local (sprint7-fill-missing-rows-2026-05-22) · ref managed_agents_registry',
  'active',
  now(),
  now()
FROM managed_agents_registry
WHERE slug = 'pr-earned-media-manager'
ON CONFLICT (name) DO NOTHING;

-- ── 4. mops-director · Optimización e Inteligencia · transversal ───────────
INSERT INTO agents (
  name, display_name, role, department_id, model, identity_content,
  identity_source, status, created_at, updated_at
)
SELECT
  'mops-director',
  display_name,
  'transversal',
  '50e776a3-8865-4704-8f48-c7524fc50a6e',  -- transversal
  CASE WHEN default_model = 'claude-haiku-4-5' THEN 'claude-haiku-4-5-20251001' ELSE default_model END,
  identity_md,
  'project-local (sprint7-fill-missing-rows-2026-05-22) · ref managed_agents_registry',
  'active',
  now(),
  now()
FROM managed_agents_registry
WHERE slug = 'mops-director'
ON CONFLICT (name) DO NOTHING;

-- ── 5. crm-architect · Infra y Routing · transversal ───────────────────────
INSERT INTO agents (
  name, display_name, role, department_id, model, identity_content,
  identity_source, status, created_at, updated_at
)
SELECT
  'crm-architect',
  display_name,
  'transversal',
  '50e776a3-8865-4704-8f48-c7524fc50a6e',  -- transversal
  CASE WHEN default_model = 'claude-haiku-4-5' THEN 'claude-haiku-4-5-20251001' ELSE default_model END,
  identity_md,
  'project-local (sprint7-fill-missing-rows-2026-05-22) · ref managed_agents_registry',
  'active',
  now(),
  now()
FROM managed_agents_registry
WHERE slug = 'crm-architect'
ON CONFLICT (name) DO NOTHING;

COMMIT;
