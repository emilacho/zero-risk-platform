-- REVERSA de 202611041900_mesa_de_estrategia · se niega si hay una mesa abierta
do $$
begin
  if to_regclass('public.estrategia_encargos') is not null and exists (select 1 from public.estrategia_encargos where estado in ('abierto', 'en_curso')) then
    raise exception 'hay una mesa abierta: no se revierte';
  end if;
end $$;
delete from public.plan_catalogo_topes where tope_id = 'tope_mesa';
alter table public.finanzas_config drop column if exists mesa_de_estrategia;
drop table if exists public.estrategia_artefactos;
drop table if exists public.estrategia_turnos;
drop table if exists public.estrategia_encargos;
