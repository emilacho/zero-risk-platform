-- ============================================
-- ZERO RISK — SEED DATA: Agency Agents
-- Run AFTER agency_schema.sql
-- ============================================

-- 1. Insert Department
INSERT INTO departments (name, display_name, description, status) VALUES
  ('marketing', 'Marketing', 'Departamento de Marketing — primera oficina de la agencia', 'active'),
  ('ventas', 'Ventas', 'Departamento de Ventas (futuro)', 'planned'),
  ('contabilidad', 'Contabilidad', 'Departamento de Contabilidad (futuro)', 'planned'),
  ('administracion', 'Administración', 'Departamento de Administración (futuro)', 'planned')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert Agents (identity_content loaded from filesystem at runtime)
-- Gerente General (no department)
INSERT INTO agents (name, display_name, role, department_id, reports_to, identity_source, identity_content, model, status) VALUES
  ('gerente-general', 'Gerente General', 'gerente_general', NULL, NULL,
   'msitarzewski/agency-agents → specialized/agents-orchestrator.md',
   'Loaded from filesystem: src/agents/identities/gerente-general.md',
   'claude-haiku', 'active');

-- Jefe de Marketing
INSERT INTO agents (name, display_name, role, department_id, reports_to, identity_source, identity_content, model, status) VALUES
  ('jefe-marketing', 'Jefe de Marketing', 'jefe_departamento',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'gerente-general'),
   'msitarzewski/agency-agents → strategy/nexus-strategy.md',
   'Loaded from filesystem: src/agents/identities/jefe-marketing.md',
   'claude-sonnet', 'active');

-- Empleados de Marketing
INSERT INTO agents (name, display_name, role, department_id, reports_to, identity_source, identity_content, model, status) VALUES
  ('content-creator', 'Content Creator', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → marketing/marketing-content-creator.md',
   'Loaded from filesystem: src/agents/identities/content-creator.md',
   'claude-sonnet', 'active'),

  ('seo-specialist', 'SEO Specialist', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → marketing/marketing-seo-specialist.md',
   'Loaded from filesystem: src/agents/identities/seo-specialist.md',
   'claude-sonnet', 'active'),

  ('media-buyer', 'Media Buyer', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → paid-media/paid-media-ppc-strategist.md',
   'Loaded from filesystem: src/agents/identities/media-buyer.md',
   'claude-sonnet', 'active'),

  ('growth-hacker', 'Growth Hacker', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → marketing/marketing-growth-hacker.md',
   'Loaded from filesystem: src/agents/identities/growth-hacker.md',
   'claude-sonnet', 'active'),

  ('social-media-strategist', 'Social Media Strategist', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → marketing/marketing-social-media-strategist.md',
   'Loaded from filesystem: src/agents/identities/social-media-strategist.md',
   'claude-haiku', 'active'),

  ('cro-specialist', 'CRO Specialist', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → marketing/marketing-app-store-optimizer.md',
   'Loaded from filesystem: src/agents/identities/cro-specialist.md',
   'claude-sonnet', 'active'),

  ('sales-enablement', 'Sales Enablement', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → sales/sales-outbound-strategist.md',
   'Loaded from filesystem: src/agents/identities/sales-enablement.md',
   'claude-sonnet', 'active'),

  ('creative-director', 'Creative Director', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → paid-media/paid-media-creative-strategist.md',
   'Loaded from filesystem: src/agents/identities/creative-director.md',
   'claude-sonnet', 'active'),

  ('tracking-specialist', 'Tracking Specialist', 'empleado',
   (SELECT id FROM departments WHERE name = 'marketing'),
   (SELECT id FROM agents WHERE name = 'jefe-marketing'),
   'msitarzewski/agency-agents → paid-media/paid-media-tracking-specialist.md',
   'Loaded from filesystem: src/agents/identities/tracking-specialist.md',
   'claude-haiku', 'active');

-- RUFLO (transversal)
INSERT INTO agents (name, display_name, role, department_id, reports_to, identity_source, identity_content, model, status) VALUES
  ('ruflo', 'RUFLO — Gatekeeper', 'transversal', NULL, NULL,
   'custom → agents/RUFLO.md',
   'Loaded from filesystem: agents/RUFLO.md',
   'claude-haiku', 'active');

-- 3. Insert Skills (34 from marketingskills repo)
-- skill_content is a placeholder — loaded from filesystem at runtime
INSERT INTO agent_skills (skill_name, skill_source, skill_content, category) VALUES
  ('ab-test-setup', 'coreyhaines31/marketingskills', 'Loaded from: skills/ab-test-setup/SKILL.md', 'measurement'),
  ('ad-creative', 'coreyhaines31/marketingskills', 'Loaded from: skills/ad-creative/SKILL.md', 'paid'),
  ('ai-seo', 'coreyhaines31/marketingskills', 'Loaded from: skills/ai-seo/SKILL.md', 'seo'),
  ('analytics-tracking', 'coreyhaines31/marketingskills', 'Loaded from: skills/analytics-tracking/SKILL.md', 'measurement'),
  ('churn-prevention', 'coreyhaines31/marketingskills', 'Loaded from: skills/churn-prevention/SKILL.md', 'retention'),
  ('cold-email', 'coreyhaines31/marketingskills', 'Loaded from: skills/cold-email/SKILL.md', 'content'),
  ('competitor-alternatives', 'coreyhaines31/marketingskills', 'Loaded from: skills/competitor-alternatives/SKILL.md', 'seo'),
  ('content-strategy', 'coreyhaines31/marketingskills', 'Loaded from: skills/content-strategy/SKILL.md', 'content'),
  ('copy-editing', 'coreyhaines31/marketingskills', 'Loaded from: skills/copy-editing/SKILL.md', 'content'),
  ('copywriting', 'coreyhaines31/marketingskills', 'Loaded from: skills/copywriting/SKILL.md', 'content'),
  ('customer-research', 'coreyhaines31/marketingskills', 'Loaded from: skills/customer-research/SKILL.md', 'strategy'),
  ('email-sequence', 'coreyhaines31/marketingskills', 'Loaded from: skills/email-sequence/SKILL.md', 'content'),
  ('form-cro', 'coreyhaines31/marketingskills', 'Loaded from: skills/form-cro/SKILL.md', 'cro'),
  ('free-tool-strategy', 'coreyhaines31/marketingskills', 'Loaded from: skills/free-tool-strategy/SKILL.md', 'growth'),
  ('launch-strategy', 'coreyhaines31/marketingskills', 'Loaded from: skills/launch-strategy/SKILL.md', 'strategy'),
  ('lead-magnets', 'coreyhaines31/marketingskills', 'Loaded from: skills/lead-magnets/SKILL.md', 'growth'),
  ('marketing-ideas', 'coreyhaines31/marketingskills', 'Loaded from: skills/marketing-ideas/SKILL.md', 'strategy'),
  ('marketing-psychology', 'coreyhaines31/marketingskills', 'Loaded from: skills/marketing-psychology/SKILL.md', 'strategy'),
  ('onboarding-cro', 'coreyhaines31/marketingskills', 'Loaded from: skills/onboarding-cro/SKILL.md', 'cro'),
  ('page-cro', 'coreyhaines31/marketingskills', 'Loaded from: skills/page-cro/SKILL.md', 'cro'),
  ('paid-ads', 'coreyhaines31/marketingskills', 'Loaded from: skills/paid-ads/SKILL.md', 'paid'),
  ('paywall-upgrade-cro', 'coreyhaines31/marketingskills', 'Loaded from: skills/paywall-upgrade-cro/SKILL.md', 'cro'),
  ('popup-cro', 'coreyhaines31/marketingskills', 'Loaded from: skills/popup-cro/SKILL.md', 'cro'),
  ('pricing-strategy', 'coreyhaines31/marketingskills', 'Loaded from: skills/pricing-strategy/SKILL.md', 'strategy'),
  ('product-marketing-context', 'coreyhaines31/marketingskills', 'Loaded from: skills/product-marketing-context/SKILL.md', 'strategy'),
  ('programmatic-seo', 'coreyhaines31/marketingskills', 'Loaded from: skills/programmatic-seo/SKILL.md', 'seo'),
  ('referral-program', 'coreyhaines31/marketingskills', 'Loaded from: skills/referral-program/SKILL.md', 'growth'),
  ('revops', 'coreyhaines31/marketingskills', 'Loaded from: skills/revops/SKILL.md', 'sales'),
  ('sales-enablement', 'coreyhaines31/marketingskills', 'Loaded from: skills/sales-enablement/SKILL.md', 'sales'),
  ('schema-markup', 'coreyhaines31/marketingskills', 'Loaded from: skills/schema-markup/SKILL.md', 'seo'),
  ('seo-audit', 'coreyhaines31/marketingskills', 'Loaded from: skills/seo-audit/SKILL.md', 'seo'),
  ('signup-flow-cro', 'coreyhaines31/marketingskills', 'Loaded from: skills/signup-flow-cro/SKILL.md', 'cro'),
  ('site-architecture', 'coreyhaines31/marketingskills', 'Loaded from: skills/site-architecture/SKILL.md', 'seo'),
  ('social-content', 'coreyhaines31/marketingskills', 'Loaded from: skills/social-content/SKILL.md', 'content');

-- 4. Assign Skills to Agents
-- Jefe Marketing: 5 strategic skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'jefe-marketing'
  AND s.skill_name IN ('product-marketing-context', 'marketing-ideas', 'marketing-psychology', 'launch-strategy', 'content-strategy');

-- Content Creator: 4 copy skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'content-creator'
  AND s.skill_name IN ('copywriting', 'copy-editing', 'email-sequence', 'cold-email');

-- SEO Specialist: 5 SEO skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'seo-specialist'
  AND s.skill_name IN ('seo-audit', 'ai-seo', 'programmatic-seo', 'site-architecture', 'schema-markup');

-- Media Buyer: 4 ads skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'media-buyer'
  AND s.skill_name IN ('paid-ads', 'ad-creative', 'analytics-tracking', 'ab-test-setup');

-- Growth Hacker: 4 growth skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'growth-hacker'
  AND s.skill_name IN ('free-tool-strategy', 'referral-program', 'pricing-strategy', 'lead-magnets');

-- Social Media Strategist: 2 skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'social-media-strategist'
  AND s.skill_name IN ('social-content', 'customer-research');

-- CRO Specialist: 6 CRO skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'cro-specialist'
  AND s.skill_name IN ('page-cro', 'signup-flow-cro', 'onboarding-cro', 'form-cro', 'popup-cro', 'paywall-upgrade-cro');

-- Sales Enablement: 3 skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'sales-enablement'
  AND s.skill_name IN ('sales-enablement', 'revops', 'churn-prevention');

-- Creative Director: 2 skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'creative-director'
  AND s.skill_name IN ('competitor-alternatives', 'ad-creative');

-- Tracking Specialist: 2 skills
INSERT INTO agent_skill_assignments (agent_id, skill_id, priority)
SELECT a.id, s.id, row_number() OVER (ORDER BY s.skill_name) as priority
FROM agents a, agent_skills s
WHERE a.name = 'tracking-specialist'
  AND s.skill_name IN ('analytics-tracking', 'ab-test-setup');

-- 5. Insert Tools (brazos) per agent
INSERT INTO agent_tools (agent_id, tool_name, tool_type, status) VALUES
  ((SELECT id FROM agents WHERE name = 'content-creator'), 'mailgun', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'content-creator'), 'gohighlevel', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'seo-specialist'), 'ga4', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'seo-specialist'), 'google-search-console', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'media-buyer'), 'meta-ads', 'composio', 'pending'),
  ((SELECT id FROM agents WHERE name = 'media-buyer'), 'google-ads', 'composio', 'pending'),
  ((SELECT id FROM agents WHERE name = 'growth-hacker'), 'supabase', 'internal', 'active'),
  ((SELECT id FROM agents WHERE name = 'growth-hacker'), 'gohighlevel', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'social-media-strategist'), 'metricool', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'social-media-strategist'), 'instagram-api', 'composio', 'pending'),
  ((SELECT id FROM agents WHERE name = 'cro-specialist'), 'posthog', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'sales-enablement'), 'gohighlevel', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'sales-enablement'), 'mailgun', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'sales-enablement'), 'whatsapp', 'composio', 'pending'),
  ((SELECT id FROM agents WHERE name = 'creative-director'), 'gpt-image-1', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'creative-director'), 'kling-ai', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'tracking-specialist'), 'ga4', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'tracking-specialist'), 'posthog', 'api_direct', 'pending'),
  ((SELECT id FROM agents WHERE name = 'tracking-specialist'), 'meta-pixel', 'api_direct', 'pending');
