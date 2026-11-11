-- REVERSA de 202611102110_cerebro_permisos_2_reglas_solo_lectura_admin: vuelve cada regla a su texto exacto medido el 10-nov
begin;
drop policy client_voc_library_admin_lee on public.client_voc_library;
create policy auth_full_client_voc_library on public.client_voc_library as permissive for all to authenticated using (true) with check (true);
alter policy authenticated_read on public.client_brain_snapshots using (true);
drop policy apify_raw_admin_lee on public.apify_raw;
create policy apify_raw_auth_full on public.apify_raw as permissive for all to authenticated using (is_admin()) with check (is_admin());
drop policy web_pages_admin_lee on public.client_web_pages;
create policy web_pages_auth_full on public.client_web_pages as permissive for all to authenticated using (is_admin()) with check (is_admin());
drop policy chunks_admin_lee on public.client_brain_chunks;
create policy chunks_admin_full on public.client_brain_chunks as permissive for all to authenticated using ((EXISTS ( SELECT 1 FROM app_roles WHERE ((app_roles.user_id = auth.uid()) AND (app_roles.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1 FROM app_roles WHERE ((app_roles.user_id = auth.uid()) AND (app_roles.role = 'admin'::text)))));
commit;
