-- REVERSA de 202611020100_organizacion_segun_el_mapa_firmado: devuelve las filas y asignaciones tal como estaban el 02-nov.
BEGIN;

INSERT INTO public.departments (id, name, display_name, description, status, created_at, updated_at) VALUES
  ('fabeb80c-a5c7-48ff-9725-33c52ba0a322', 'paid_media', 'Paid Media', NULL, 'active', '2026-04-10T22:21:22.678596+00:00', '2026-04-10T22:21:22.678596+00:00'),
  ('3dbba4e0-e325-4dd4-8115-f899c386c4e4', 'ventas', 'Ventas', 'Departamento de Ventas (futuro)', 'planned', '2026-04-06T13:14:15.758464+00:00', '2026-04-06T13:14:15.758464+00:00')
ON CONFLICT (id) DO NOTHING;
UPDATE public.departments SET display_name = 'Sales', updated_at = '2026-04-10T22:21:22.678596+00:00' WHERE id = 'df6c193c-2584-40af-a869-7cea79c7059a';

UPDATE public.agents SET department_id = 'fabeb80c-a5c7-48ff-9725-33c52ba0a322' WHERE name IN ('paid_media_auditor', 'paid_media_creative_strategist', 'paid_media_paid_social_strategist', 'paid_media_ppc_strategist', 'paid_media_programmatic_buyer', 'paid_media_search_query_analyst');
UPDATE public.agents SET department_id = '9e45ceeb-063f-44e8-9033-9897b6aa8428', reports_to = '62ca50de-d9da-4b98-8861-3ae30ebe5377' WHERE name = 'sales-enablement';
UPDATE public.agents SET department_id = '50e776a3-8865-4704-8f48-c7524fc50a6e', reports_to = NULL, role = 'jefe_departamento' WHERE name = 'editor_en_jefe';
UPDATE public.agents SET department_id = '530570e8-8ca2-4e63-b9f6-236c0c4a1d35' WHERE name = 'reporting_agent';

DELETE FROM public.oficina_directorio WHERE activo = false AND agente IN (
  'jefe-marketing', 'spell-check-corrector', 'revisor-externo-gpt', 'editor_en_jefe', 'social-media-strategist', 'brand_strategist', 'web_designer', 'creative-director', 'style-consistency-reviewer', 'delivery-coordinator', 'cro-specialist', 'seo-specialist', 'seo-content-strategist', 'seo-backlink-strategist', 'seo-technical', 'seo-orchestrator', 'seo-geo-optimization', 'marketing_ai_citation_strategist', 'media-buyer', 'paid_media_auditor', 'paid_media_creative_strategist', 'paid_media_paid_social_strategist', 'paid_media_ppc_strategist', 'paid_media_programmatic_buyer', 'paid_media_search_query_analyst', 'email-marketer', 'optimization-agent', 'reporting_agent', 'tracking-specialist', 'community_manager', 'review-responder', 'marketing_twitter_engager', 'pr-earned-media-manager', 'influencer-manager'
);

COMMIT;
