-- REVERSA de 202611100900_oficina_encargos_tope_20 · vuelve el máximo a US$ 10 en las dos reglas.
-- Se NIEGA si algún encargo o alguna plantilla ya tiene un tope mayor que 10: no se reescriben datos para poder volver atrás.
begin;
do $$
begin
  if exists (select 1 from public.oficina_encargos where tope_usd > 10) then
    raise exception 'hay encargos con tope mayor que US$ 10: la reversa no reescribe datos';
  end if;
  if exists (select 1 from public.oficina_tipos_de_grupo where tope_encargo_usd > 10) then
    raise exception 'hay plantillas con tope mayor que US$ 10: la reversa no reescribe datos';
  end if;
end $$;
alter table public.oficina_encargos drop constraint if exists oficina_encargos_tope_valido;
alter table public.oficina_encargos add constraint oficina_encargos_tope_valido check (tope_usd > 0 and tope_usd <= 10);
alter table public.oficina_tipos_de_grupo drop constraint if exists oficina_tipos_tope_valido;
alter table public.oficina_tipos_de_grupo add constraint oficina_tipos_tope_valido check (tope_encargo_usd > 0 and tope_encargo_usd <= 10);
commit;
