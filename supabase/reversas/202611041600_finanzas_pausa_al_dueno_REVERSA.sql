-- REVERSA de 202611041600_finanzas_pausa_al_dueno · se niega si hay algo en pausa: bajar el estado dejaría una corrida sin forma de volver
do $$
begin
  if exists (select 1 from public.finanzas_encargos where estado = 'esperando_al_dueno') or exists (select 1 from public.plan_corridas where estado = 'en_pausa') then
    raise exception 'hay corridas en pausa: no se revierte';
  end if;
end $$;
alter table public.finanzas_encargos drop constraint if exists finanzas_encargos_estado_check;
alter table public.finanzas_encargos add constraint finanzas_encargos_estado_check check (estado in ('abierto', 'en_curso', 'cerrado', 'sin_acuerdo', 'cierre_por_tope', 'fallido'));
alter table public.plan_corridas drop constraint if exists plan_corridas_estado_check;
alter table public.plan_corridas add constraint plan_corridas_estado_check check (estado in ('esperando', 'corriendo', 'hecha', 'vencida', 'fallida'));
alter table public.finanzas_config drop column if exists pausa_al_dueno;
alter table public.esperas_del_dueno drop column if exists despertar_intentos;
alter table public.esperas_del_dueno drop column if exists sobre_de_reanudacion;
do $$
declare ultima integer;
begin
  select version into ultima from public.plan_catalogo_topes where tope_id = 'tope_oficina' and vigente and usd = 5;
  if ultima is not null and ultima > 1 then
    update public.plan_catalogo_topes set vigente = false where tope_id = 'tope_oficina' and version = ultima;
    update public.plan_catalogo_topes set vigente = true where tope_id = 'tope_oficina' and version = ultima - 1;
    delete from public.plan_catalogo_topes where tope_id = 'tope_oficina' and version = ultima;
  end if;
end $$;
