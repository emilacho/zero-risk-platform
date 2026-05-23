-- Sprint 7 A6 · canonize `agent_invocations.agent_name` to canonical slug.
--
-- Pre-state · mix of slug (kebab) and display_name (capitalized humanized).
-- Per audit 2026-05-21-sprint6-audit-agents-wired · gap noted as P2 hygiene.
-- Runtime persists whatever the agent-sdk-runner sends · display_name leaked in.
--
-- Post-state · all rows use kebab slug · `Jefe de Marketing` → `jefe-marketing`
-- (matches agents.name canon).
--
-- Idempotent · UPDATE only rows that don't already match a known slug.

BEGIN;

-- Manual mapping for known display_name → slug pairs.
UPDATE agent_invocations SET agent_name = 'jefe-marketing'           WHERE agent_name = 'Jefe de Marketing';
UPDATE agent_invocations SET agent_name = 'jefe-client-success'      WHERE agent_name = 'Jefe de Client Success';
UPDATE agent_invocations SET agent_name = 'brand-strategist'         WHERE agent_name = 'Brand Strategist';
UPDATE agent_invocations SET agent_name = 'editor-en-jefe'           WHERE agent_name = 'Editor en Jefe (QA)';
UPDATE agent_invocations SET agent_name = 'content-creator'          WHERE agent_name = 'Content Creator';
UPDATE agent_invocations SET agent_name = 'creative-director'        WHERE agent_name = 'Creative Director';
UPDATE agent_invocations SET agent_name = 'community-manager'        WHERE agent_name = 'Community Manager';
UPDATE agent_invocations SET agent_name = 'mops-director'            WHERE agent_name = 'Marketing Operations Director';
UPDATE agent_invocations SET agent_name = 'seo-orchestrator'         WHERE agent_name = 'SEO Orchestrator';
UPDATE agent_invocations SET agent_name = 'gerente-general'          WHERE agent_name = 'Gerente General';
UPDATE agent_invocations SET agent_name = 'web-designer'             WHERE agent_name = 'Web Designer';
UPDATE agent_invocations SET agent_name = 'onboarding-specialist'    WHERE agent_name = 'Onboarding Specialist';
UPDATE agent_invocations SET agent_name = 'carousel-designer'        WHERE agent_name = 'Carousel Designer';
-- 'system' stays as 'system' · canonical placeholder for non-agent system calls

COMMIT;

-- Verify
SELECT agent_name, count(*) AS execs
FROM agent_invocations
WHERE created_at > now() - interval '30 days'
GROUP BY agent_name
ORDER BY agent_name;
