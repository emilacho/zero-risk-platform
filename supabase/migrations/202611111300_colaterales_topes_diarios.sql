-- COLATERALES 2d · el TOPE DIARIO por cliente es un DATO, no una constante del código (RESPUESTA Lenovo 11-nov 03:02Z: US$ 5 por cliente y por día, configurable por cliente).
-- Una fila SIN cliente = el valor por omisión (una sola). Una fila CON cliente reemplaza el valor por omisión para ese cliente.
-- Sin ninguna fila, el turno frena (no gasta). El valor va de más de 0 a 50 como máximo (una red contra un error de tipeo).
-- Permisos (lección #985): primero se quita TODO a public, anon y authenticated; el servidor solo LEE. Cambiar un tope es una migración o una decisión aparte, nunca el flujo.
-- Agnóstico: ningún dato de un cliente.
begin;

create table if not exists public.colaterales_topes_diarios (
  id uuid primary key default gen_random_uuid(),
  client_id uuid null references public.clients(id) on delete restrict,
  tope_usd numeric(6, 2) not null,
  motivo text not null,
  updated_at timestamptz not null default now(),
  constraint colaterales_topes_diarios_tope_valido check (tope_usd > 0 and tope_usd <= 50),
  constraint colaterales_topes_diarios_motivo check (length(btrim(motivo)) > 0)
);
-- un tope por cliente, y UNA sola fila por omisión
create unique index if not exists colaterales_topes_diarios_un_cliente on public.colaterales_topes_diarios (client_id) where client_id is not null;
create unique index if not exists colaterales_topes_diarios_una_por_omision on public.colaterales_topes_diarios ((client_id is null)) where client_id is null;

insert into public.colaterales_topes_diarios (client_id, tope_usd, motivo)
select null, 5, 'por omisión · RESPUESTA Lenovo 11-nov 03:02Z: US$ 5 por cliente y por día mientras se construye'
where not exists (select 1 from public.colaterales_topes_diarios where client_id is null);

alter table public.colaterales_topes_diarios enable row level security;
revoke all on public.colaterales_topes_diarios from public, anon, authenticated, service_role;
grant select on public.colaterales_topes_diarios to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'colaterales_topes_diarios' and policyname = 'colaterales_topes_diarios_leer') then
    create policy colaterales_topes_diarios_leer on public.colaterales_topes_diarios for select to service_role using (true);
  end if;
end $$;

commit;
