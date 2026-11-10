-- REVERSA de 202611101400 · vuelve a los privilegios por omisión del esquema (los que dejó 202611101300). No toca filas.
begin;
grant truncate, trigger, references on public.perfil_publico_voces to anon, authenticated, service_role;
commit;
