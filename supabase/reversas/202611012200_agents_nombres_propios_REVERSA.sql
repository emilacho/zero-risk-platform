-- REVERSA de 202611012200 · devuelve los 9 nombres anteriores, solo si el nombre vivo es el que dejó la migración.
BEGIN;
UPDATE public.agents SET display_name = 'Account Strategist' WHERE name = 'account_manager' AND display_name = 'Account Manager';
UPDATE public.agents SET display_name = 'Brand Guardian' WHERE name = 'brand_strategist' AND display_name = 'Brand Strategist';
UPDATE public.agents SET display_name = 'Reddit Community Builder' WHERE name = 'community_manager' AND display_name = 'Community Manager';
UPDATE public.agents SET display_name = 'Reality Checker' WHERE name = 'editor_en_jefe' AND display_name = 'Editor en Jefe';
UPDATE public.agents SET display_name = 'Account Strategist' WHERE name = 'jefe_client_success' AND display_name = 'Jefe de Client Success';
UPDATE public.agents SET display_name = 'Trend Researcher' WHERE name = 'market_research_analyst' AND display_name = 'Market Research Agent';
UPDATE public.agents SET display_name = 'Support Responder' WHERE name = 'onboarding_specialist' AND display_name = 'Onboarding Specialist';
UPDATE public.agents SET display_name = 'Executive Summary Generator' WHERE name = 'reporting_agent' AND display_name = 'Reporting Agent';
UPDATE public.agents SET display_name = 'UI Designer' WHERE name = 'web_designer' AND display_name = 'Web Designer';
COMMIT;
