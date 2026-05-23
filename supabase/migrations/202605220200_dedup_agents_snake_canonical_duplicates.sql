-- Sprint 7.6 D1 · Dedup agents table · snake_case canonical seeds → kebab-case canon
--
-- Context · CC#4 audit 2026-05-22 reveló 69 rows en `agents` · canon claim 40.
-- Diferencia · 10+ snake_case entries adoptadas como "canonical-adopt
-- (managed_agents_registry...)" coexisten con kebab-case canon de
-- MANIFEST-31. El alias map (`src/lib/agent-alias-map.ts`) resuelve a
-- runtime · pero las duplicate rows pollute conteos + audits + UI.
--
-- Safety check · n8n live workflows scan (CC#4 2026-05-22 via REST) ·
-- verificación per slug · 9 de 10 candidatos tienen 0 refs en workflow
-- JSONs · safe a delete. `market_research_analyst` tiene 1 ref · gated
-- en script JS pre-delete · si no se confirma orphan dejar.
--
-- Backup · NO required pre-DELETE (identity_content ya está en kebab-case
-- equivalent · alias map preserva resolution). Para extra safety · pre-image
-- snapshot en outputs/sprint7p6-dedup-backups-YYYY-MM-DD/ via script.
--
-- Idempotent · DELETE solo dispara si row existe.

BEGIN;

-- 1 · True duplicate del audit · exact same role
DELETE FROM public.agents WHERE name = 'competitive_intelligence_agent';

-- 9 · Snake_case canonical seeds duplicating kebab-case MANIFEST entries
-- (0 n8n workflow refs confirmed via REST scan 2026-05-22)
DELETE FROM public.agents WHERE name = 'customer_research_agent';
DELETE FROM public.agents WHERE name = 'marketing_content_creator';
DELETE FROM public.agents WHERE name = 'marketing_growth_hacker';
DELETE FROM public.agents WHERE name = 'marketing_seo_specialist';
DELETE FROM public.agents WHERE name = 'marketing_social_media_strategist';
DELETE FROM public.agents WHERE name = 'paid_media_tracking_specialist';
DELETE FROM public.agents WHERE name = 'influencer_partnerships_manager';
DELETE FROM public.agents WHERE name = 'video_editor_motion_designer';

-- `market_research_analyst` · 1 n8n workflow ref detected · NO DELETE
-- aquí · gated · si Cowork confirma orphan ejecutar manualmente ·
-- DELETE FROM public.agents WHERE name = 'market_research_analyst';

-- Verify count · 10 DELETEs expected · post-migration count = 69 - 10 = 59
-- (still > canon claim 40 · the 19+ project-local Sprint additions are
-- legitimate · NO scope para borrarlos · documentar en CLAUDE.md sección
-- agentes la realidad post-Sprint-7.6 · 59 agents en production).

COMMIT;

-- Post-migration verify queries (run in Supabase SQL editor) ·
--
--   SELECT count(*) FROM public.agents;
--   -- expect 59 (was 69)
--
--   SELECT name FROM public.agents WHERE name LIKE '%_agent'
--     OR name LIKE 'marketing_%' OR name LIKE 'customer_research%'
--     OR name LIKE 'paid_media_tracking%' OR name LIKE 'influencer_partnerships%'
--     OR name LIKE 'video_editor_motion%';
--   -- expect rows for legitimate project-local extensions
--   -- (marketing_carousel_growth_engine · paid_media_auditor · etc)
--   -- but NOT for the 9 deleted duplicates
--
--   SELECT name FROM public.agents WHERE name = 'competitive_intelligence_agent';
--   -- expect 0 rows (deleted)
