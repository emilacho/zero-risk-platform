-- REVERSA de 202611102300_valores_por_omision_public_sin_permisos_de_mas.sql · vuelve a lo medido en vivo el 10-nov 18:31Z
-- (postgres en public · tablas service_role=Dxtm · contadores anon=w, authenticated=w, service_role=w).
begin;
alter default privileges for role postgres in schema public grant truncate, references, trigger, maintain on tables to service_role;
alter default privileges for role postgres in schema public grant update on sequences to anon, authenticated, service_role;
commit;
