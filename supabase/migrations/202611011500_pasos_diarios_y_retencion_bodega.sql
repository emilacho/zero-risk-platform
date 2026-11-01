-- 01-nov · encargo «fallas pendientes y retención»
-- 1) cerebro_pasos_diarios: cada paso largo del día (redes, tendencias, bodega) es una llamada propia con su registro; "hecha" solo al terminar de verdad.
-- 2) client_videos.archivo_borrado_en: la retención de 90 días de la bodega borra SOLO el archivo; la fila, las capturas, la transcripción y los datos se quedan.
create table if not exists public.cerebro_pasos_diarios (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  dia date not null,
  paso text not null check (paso in ('cuentas_y_comentarios','tendencias','bodega','transcripcion')),
  estado text not null default 'en_curso' check (estado in ('en_curso','hecha','con_errores','abandonada')),
  intentos int not null default 1,
  iniciado_en timestamptz not null default now(),
  terminado_en timestamptz,
  resumen jsonb not null default '{}'::jsonb,
  gasto_usd numeric(14,6) not null default 0,
  workflow_id text,
  workflow_execution_id text,
  unique (client_id, dia, paso)
);
create index if not exists cerebro_pasos_diarios_dia on public.cerebro_pasos_diarios (dia, estado);
alter table public.cerebro_pasos_diarios enable row level security;
revoke all on public.cerebro_pasos_diarios from public, anon, authenticated;
grant select, insert, update on public.cerebro_pasos_diarios to service_role;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.cerebro_pasos_diarios'::regclass and polname = 'cerebro_pasos_diarios_service') then
    create policy cerebro_pasos_diarios_service on public.cerebro_pasos_diarios for all to service_role using (true) with check (true);
  end if;
end $$;
comment on table public.cerebro_pasos_diarios is 'CEREBRO · un renglón por cliente, día y paso largo. En curso hasta que termina de verdad; uno atascado se retoma y tras 3 intentos queda abandonado.';

alter table public.client_videos add column if not exists archivo_borrado_en timestamptz;
