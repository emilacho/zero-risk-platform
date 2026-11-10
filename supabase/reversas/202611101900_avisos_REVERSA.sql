-- REVERSA de 202611101900_avisos · se niega si la tabla ya guardó avisos (el historial no se borra sin decisión aparte).
begin;
do $$
begin
  if to_regclass('public.avisos') is not null and exists (select 1 from public.avisos) then
    raise exception 'avisos tiene historial: la reversa no lo borra';
  end if;
end $$;
drop function if exists public.avisos_avisar(text, text, text, text, uuid, text, text, text, text);
drop function if exists public.avisos_cerrar(text, text);
drop table if exists public.avisos;
commit;
notify pgrst, 'reload schema';
