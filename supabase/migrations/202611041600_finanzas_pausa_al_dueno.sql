-- 04-nov · LA OFICINA FINANCIERA ESPERA AL DUEÑO (Emilio 15:18Z; visto de Lenovo 15:33Z) · CC1
-- Aditiva: nada cambia hasta encender `finanzas_config.pausa_al_dueno`, que nace en false y se enciende cuando el flujo del plan ya sepa pausar.
-- REVERSA: `supabase/reversas/202611041600_finanzas_pausa_al_dueno_REVERSA.sql` (se niega si hay algo en pausa).

alter table public.finanzas_encargos drop constraint if exists finanzas_encargos_estado_check;
alter table public.finanzas_encargos add constraint finanzas_encargos_estado_check check (estado in ('abierto', 'en_curso', 'esperando_al_dueno', 'cerrado', 'sin_acuerdo', 'cierre_por_tope', 'fallido'));

-- `en_pausa` queda fuera del índice de «una activa por cliente» y del barrido: no vence y no impide pedir otro plan
alter table public.plan_corridas drop constraint if exists plan_corridas_estado_check;
alter table public.plan_corridas add constraint plan_corridas_estado_check check (estado in ('esperando', 'corriendo', 'en_pausa', 'hecha', 'vencida', 'fallida'));

alter table public.finanzas_config add column if not exists pausa_al_dueno boolean not null default false;
alter table public.esperas_del_dueno add column if not exists despertar_intentos integer not null default 0;

-- el cupo que el pre-vuelo exige debe cubrir el tope nuevo de la oficina (US$ 1,50 → 5): versión nueva, la anterior queda como historia
do $$
declare siguiente integer;
begin
  if exists (select 1 from public.plan_catalogo_topes where tope_id = 'tope_oficina' and vigente and usd <> 5) then
    select max(version) + 1 into siguiente from public.plan_catalogo_topes where tope_id = 'tope_oficina';
    update public.plan_catalogo_topes set vigente = false where tope_id = 'tope_oficina' and vigente;
    insert into public.plan_catalogo_topes (tope_id, tramo, fuente_id, usd, contador, version, vigente, pais)
      select tope_id, tramo, fuente_id, 5, contador, siguiente, true, pais from public.plan_catalogo_topes where tope_id = 'tope_oficina' and version = siguiente - 1;
  end if;
end $$;
