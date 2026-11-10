-- REVERSA de 202611101700_colaterales_ediciones_y_retoques · se niega si alguna de las dos tablas ya guardó historial (no se borra sin decisión aparte).
begin;
do $$
begin
  if to_regclass('public.colaterales_ediciones') is not null and exists (select 1 from public.colaterales_ediciones) then
    raise exception 'colaterales_ediciones tiene historial: la reversa no lo borra';
  end if;
  if to_regclass('public.colaterales_retoques') is not null and exists (select 1 from public.colaterales_retoques) then
    raise exception 'colaterales_retoques tiene historial: la reversa no lo borra';
  end if;
end $$;
drop table if exists public.colaterales_retoques;
drop table if exists public.colaterales_ediciones;
commit;
notify pgrst, 'reload schema';
