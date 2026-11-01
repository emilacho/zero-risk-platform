-- 01-nov · ENCARGO Lenovo firmado por Emilio («sí, de una vez») · nombres de empleados · CC1
-- agents.display_name no correspondía a la identidad de 9 empleados (tres de ellos, además, repetidos). Cada uno recibe el nombre que dice su propia identidad.
-- Solo cambia display_name. No toca identity_content, modelo ni estado. Cada UPDATE solo pega si el nombre vivo es el leído hoy; repetirla no cambia nada.
-- REVERSA: supabase/reversas/202611012200_agents_nombres_propios_REVERSA.sql
BEGIN;
UPDATE public.agents SET display_name = 'Account Manager' WHERE name = 'account_manager' AND display_name = 'Account Strategist';
UPDATE public.agents SET display_name = 'Brand Strategist' WHERE name = 'brand_strategist' AND display_name = 'Brand Guardian';
UPDATE public.agents SET display_name = 'Community Manager' WHERE name = 'community_manager' AND display_name = 'Reddit Community Builder';
UPDATE public.agents SET display_name = 'Editor en Jefe' WHERE name = 'editor_en_jefe' AND display_name = 'Reality Checker';
UPDATE public.agents SET display_name = 'Jefe de Client Success' WHERE name = 'jefe_client_success' AND display_name = 'Account Strategist';
UPDATE public.agents SET display_name = 'Market Research Agent' WHERE name = 'market_research_analyst' AND display_name = 'Trend Researcher';
UPDATE public.agents SET display_name = 'Onboarding Specialist' WHERE name = 'onboarding_specialist' AND display_name = 'Support Responder';
UPDATE public.agents SET display_name = 'Reporting Agent' WHERE name = 'reporting_agent' AND display_name = 'Executive Summary Generator';
UPDATE public.agents SET display_name = 'Web Designer' WHERE name = 'web_designer' AND display_name = 'UI Designer';
-- si un nombre vivo era otro distinto del leído, o queda algún repetido, se revierte todo
DO $$
DECLARE
  bien int;
  repetidos int;
BEGIN
  SELECT count(*) INTO bien FROM public.agents WHERE (name, display_name) IN (
    ('account_manager', 'Account Manager'), ('brand_strategist', 'Brand Strategist'), ('community_manager', 'Community Manager'),
    ('editor_en_jefe', 'Editor en Jefe'), ('jefe_client_success', 'Jefe de Client Success'), ('market_research_analyst', 'Market Research Agent'),
    ('onboarding_specialist', 'Onboarding Specialist'), ('reporting_agent', 'Reporting Agent'), ('web_designer', 'Web Designer'));
  IF bien <> 9 THEN RAISE EXCEPTION 'esperaba 9 nombres corregidos y hay %', bien; END IF;
  SELECT count(*) INTO repetidos FROM (SELECT display_name FROM public.agents GROUP BY display_name HAVING count(*) > 1) r;
  IF repetidos <> 0 THEN RAISE EXCEPTION 'quedan % nombres repetidos', repetidos; END IF;
END $$;
COMMIT;
