-- Cerebro · paso 2 · con sesión ya no hay reglas de escritura en el cerebro; leer queda solo para el admin
-- Encargo firmado por Emilio 10-nov (raw/tasks/2026-11-10-ENCARGO-CEREBRO-CC-CEREBRO-cerrar-permisos-del-cerebro.md) · CC-CEREBRO
-- client_voc_library tenía «todo a cualquiera con sesión» (y su disparador re-indexa el cerebro); client_brain_snapshots, «leer todo con sesión».
-- Las de admin con ALL pasan a solo leer. Texto exacto de antes: fixture; reversa: supabase/reversas/202611102110_cerebro_permisos_2_reglas_solo_lectura_admin_REVERSA.sql
begin;
set local lock_timeout = '5s';
drop policy auth_full_client_voc_library on public.client_voc_library;
create policy client_voc_library_admin_lee on public.client_voc_library for select to authenticated using (public.is_admin());
alter policy authenticated_read on public.client_brain_snapshots using (public.is_admin());
drop policy apify_raw_auth_full on public.apify_raw;
create policy apify_raw_admin_lee on public.apify_raw for select to authenticated using (public.is_admin());
drop policy web_pages_auth_full on public.client_web_pages;
create policy web_pages_admin_lee on public.client_web_pages for select to authenticated using (public.is_admin());
drop policy chunks_admin_full on public.client_brain_chunks;
create policy chunks_admin_lee on public.client_brain_chunks for select to authenticated using (public.is_admin());
commit;
