-- CIERRE DE PERMISOS · PASO 3 + 3b (GO de Lenovo, «dale» de Emilio 10-nov 14:20Z)
-- 3 · 76 reglas de 64 tablas decían sí a CUALQUIER cuenta (using/with check true para authenticated).
--     La web de Náufrago usa nuestra base para las cuentas de sus compradores: cualquiera de ellos podía leer o cambiar datos de la agencia.
--     Cada regla conserva su nombre, su comando y su rol; solo cambia `true` por `public.is_admin()`. Nadie lee estas tablas con la sesión:
--     los dos tableros y la plataforma usan la llave del servidor, que salta las reglas por fila (medido 10-nov).
--     FUERA a propósito: el cerebro (client_voc_library, client_brain_snapshots, cerebro_*), app_roles y auth_clients (el ingreso),
--     leads INSERT anónimo (formulario), landings, y las funciones is_admin y client_ids_for_user (las usan las reglas).
-- 3b · 6 funciones SECURITY DEFINER (costos, estadísticas, recálculo) y la vista guardada del resumen diario dejaban leer costos
--     saltando las reglas. EXECUTE se hereda de PUBLIC: se quita a public, anon y authenticated, y queda el servidor.
-- No toca filas. Reversa exacta en supabase/reversas/.

begin;
alter policy "read_all_authenticated" on public.ad_creative_refreshes using (public.is_admin());
alter policy "read_all_authenticated" on public.ad_performance_snapshots using (public.is_admin());
alter policy "authenticated_read" on public.agent_health_metrics using (public.is_admin());
alter policy "auth_full_agent_improvement_proposals" on public.agent_improvement_proposals using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_agent_insights" on public.agent_insights using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_agent_outcomes" on public.agent_outcomes using (public.is_admin()) with check (public.is_admin());
alter policy "read_all_authenticated" on public.agent_outcomes using (public.is_admin());
alter policy "read_all_authenticated" on public.agent_routing_log using (public.is_admin());
alter policy "authenticated_read_agent_skill_assignments" on public.agent_skill_assignments using (public.is_admin());
alter policy "authenticated_read_agent_skills" on public.agent_skills using (public.is_admin());
alter policy "authenticated_read_agent_tools" on public.agent_tools using (public.is_admin());
alter policy "authenticated_read_agents" on public.agents using (public.is_admin());
alter policy "Authenticated users can insert agents_log" on public.agents_log with check (public.is_admin());
alter policy "Authenticated users can read agents_log" on public.agents_log using (public.is_admin());
alter policy "apify_raw_auth_full" on public.apify_raw using (public.is_admin()) with check (public.is_admin());
alter policy "read_all_authenticated" on public.attribution_audits using (public.is_admin());
alter policy "read_all_authenticated" on public.backlink_opportunities using (public.is_admin());
alter policy "read_all_authenticated" on public.campaign_pipeline_state using (public.is_admin());
alter policy "auth_full_campaign_results" on public.campaign_results using (public.is_admin()) with check (public.is_admin());
alter policy "Authenticated users can delete campaigns" on public.campaigns using (public.is_admin());
alter policy "Authenticated users can insert campaigns" on public.campaigns with check (public.is_admin());
alter policy "Authenticated users can read campaigns" on public.campaigns using (public.is_admin());
alter policy "Authenticated users can update campaigns" on public.campaigns using (public.is_admin()) with check (public.is_admin());
alter policy "read_all_authenticated" on public.cannibalization_audits using (public.is_admin());
alter policy "auth_full_churn_predictions" on public.churn_predictions using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_client_brand_books" on public.client_brand_books using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_client_competitive_landscape" on public.client_competitive_landscape using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_client_historical_outputs" on public.client_historical_outputs using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_client_icp_documents" on public.client_icp_documents using (public.is_admin()) with check (public.is_admin());
alter policy "web_pages_auth_full" on public.client_web_pages using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_clients" on public.clients using (public.is_admin()) with check (public.is_admin());
alter policy "authenticated_read" on public.community_health using (public.is_admin());
alter policy "auth_full_community_health_snapshots" on public.community_health_snapshots using (public.is_admin()) with check (public.is_admin());
alter policy "Authenticated users can delete content" on public.content using (public.is_admin());
alter policy "Authenticated users can insert content" on public.content with check (public.is_admin());
alter policy "Authenticated users can read content" on public.content using (public.is_admin());
alter policy "Authenticated users can update content" on public.content using (public.is_admin()) with check (public.is_admin());
alter policy "authenticated_read" on public.content_fetch_cache using (public.is_admin());
alter policy "read_all_authenticated" on public.content_refresh_queue using (public.is_admin());
alter policy "read_all_authenticated" on public.content_repurposing_queue using (public.is_admin());
alter policy "Authenticated users can insert costs" on public.costs with check (public.is_admin());
alter policy "Authenticated users can read costs" on public.costs using (public.is_admin());
alter policy "read_all_authenticated" on public.creative_performance_insights using (public.is_admin());
alter policy "read_all_authenticated" on public.cro_experiments using (public.is_admin());
alter policy "authenticated_read_departments" on public.departments using (public.is_admin());
alter policy "authenticated_read" on public.email_sequences using (public.is_admin());
alter policy "authenticated_read" on public.error_events using (public.is_admin());
alter policy "auth_full_expansion_opportunities" on public.expansion_opportunities using (public.is_admin()) with check (public.is_admin());
alter policy "read_all_authenticated" on public.hitl_cycle_metrics using (public.is_admin());
alter policy "read_all_authenticated" on public.hitl_pending_approvals using (public.is_admin());
alter policy "auth_full_hitl_queue" on public.hitl_queue using (public.is_admin()) with check (public.is_admin());
alter policy "read_all_authenticated" on public.identity_improvement_queue using (public.is_admin());
alter policy "read_all_authenticated" on public.incrementality_tests using (public.is_admin());
alter policy "read_all_authenticated" on public.indexation_log using (public.is_admin());
alter policy "authenticated_read" on public.influencer_approved_list using (public.is_admin());
alter policy "authenticated_read" on public.influencer_rejections using (public.is_admin());
alter policy "jefatura_policies_authenticated_read" on public.jefatura_grading_policies using (public.is_admin());
alter policy "read_all_authenticated" on public.landing_experiments using (public.is_admin());
alter policy "Authenticated users can delete leads" on public.leads using (public.is_admin());
alter policy "Authenticated users can insert leads" on public.leads with check (public.is_admin());
alter policy "Authenticated users can read leads" on public.leads using (public.is_admin());
alter policy "Authenticated users can update leads" on public.leads using (public.is_admin()) with check (public.is_admin());
alter policy "read_all_authenticated" on public.message_match_audits using (public.is_admin());
alter policy "auth_full_meta_agent_runs" on public.meta_agent_runs using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_nps_dispatch_log" on public.nps_dispatch_log using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_onboarding_discovery_logs" on public.onboarding_discovery_logs using (public.is_admin()) with check (public.is_admin());
alter policy "auth_full_onboarding_sessions" on public.onboarding_sessions using (public.is_admin()) with check (public.is_admin());
alter policy "read_all_authenticated" on public.performance_metrics using (public.is_admin());
alter policy "read_all_authenticated" on public.phase_gate_audits using (public.is_admin());
alter policy "pipeline_results_authenticated_read" on public.pipeline_results using (public.is_admin());
alter policy "authenticated_read" on public.review_responses_queue using (public.is_admin());
alter policy "auth_full_rfm_segments" on public.rfm_segments using (public.is_admin()) with check (public.is_admin());
alter policy "read_all_authenticated" on public.rsa_headline_library using (public.is_admin());
alter policy "authenticated_read" on public.subject_line_tests using (public.is_admin());
alter policy "read_all_authenticated" on public.topical_authority_maps using (public.is_admin());
alter policy "authenticated_read" on public.uptime_incidents using (public.is_admin());
revoke execute on function public.agent_stats_mini_batch(timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.agent_stats_mini_batch(timestamp with time zone, timestamp with time zone) to service_role;
revoke execute on function public.agent_stats_timeline(text, timestamp with time zone, timestamp with time zone, text, text) from public, anon, authenticated;
grant execute on function public.agent_stats_timeline(text, timestamp with time zone, timestamp with time zone, text, text) to service_role;
revoke execute on function public.agent_stats_totals(text, timestamp with time zone, timestamp with time zone, text, text) from public, anon, authenticated;
grant execute on function public.agent_stats_totals(text, timestamp with time zone, timestamp with time zone, text, text) to service_role;
revoke execute on function public.costs_breakdown(timestamp with time zone, timestamp with time zone, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.costs_breakdown(timestamp with time zone, timestamp with time zone, text, text, text, text, integer) to service_role;
revoke execute on function public.costs_timeline(timestamp with time zone, timestamp with time zone, text, text, text) from public, anon, authenticated;
grant execute on function public.costs_timeline(timestamp with time zone, timestamp with time zone, text, text, text) to service_role;
revoke execute on function public.refresh_agent_invocations_daily_rollup() from public, anon, authenticated;
grant execute on function public.refresh_agent_invocations_daily_rollup() to service_role;
revoke all on public.agent_invocations_daily_rollup from public, anon, authenticated;
commit;
