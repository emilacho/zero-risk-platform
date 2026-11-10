-- REVERSA de 202611101300_perfil_publico_voces · se niega si la tabla ya guardó voces (no se borra lo raspado y pagado sin decisión aparte).
begin;
do $$
begin
  if to_regclass('public.perfil_publico_voces') is not null and exists (select 1 from public.perfil_publico_voces) then
    raise exception 'perfil_publico_voces tiene voces guardadas: la reversa no las borra';
  end if;
end $$;
drop table if exists public.perfil_publico_voces;
commit;
notify pgrst, 'reload schema';
