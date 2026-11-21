-- REVERSA de 202611060100 · apaga la pausa. Se niega si hay algo en pausa: apagarla dejaría a esa corrida esperando sin que nadie la suelte.
do $$
begin
  if exists (select 1 from public.finanzas_encargos where estado = 'esperando_al_dueno') or exists (select 1 from public.plan_corridas where estado = 'en_pausa') then
    raise exception 'hay corridas en pausa: no se apaga';
  end if;
  update public.finanzas_config set pausa_al_dueno = false, actualizado_en = now() where id = 1;
end $$;
