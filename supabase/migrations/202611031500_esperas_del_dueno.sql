-- 03-nov · LA CADENA ESPERA AL DUEÑO (firma de Emilio 14:46Z, ajuste 14:49Z: «pequeñas pausas que se quitan cuando yo hago las aprobaciones») · CC1
-- Misma forma que plan_aprobaciones: nada queda corriendo. El flujo guarda aquí el sobre que iba a mandar; la aprobación lo suelta una sola vez.
-- Sin vencimiento y sin gasto mientras espera. `tipo` queda abierto para reusarla en otras aprobaciones; por ahora solo se usa 'manual'.
create table if not exists public.esperas_del_dueno (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  tipo text not null,
  clave text not null,
  sobre jsonb not null,
  estado text not null default 'esperando' check (estado in ('esperando', 'soltada', 'reemplazada')),
  manual_id text,
  soltada_por text,
  soltada_en timestamptz,
  despertado boolean,
  despertar_detalle text,
  workflow_id text,
  workflow_execution_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tipo, clave)
);
create index if not exists esperas_del_dueno_cliente on public.esperas_del_dueno (client_id, tipo, creado_en desc);
alter table public.esperas_del_dueno enable row level security;
revoke all on public.esperas_del_dueno from public, anon, authenticated;
grant select, insert, update on public.esperas_del_dueno to service_role;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.esperas_del_dueno'::regclass and polname = 'esperas_del_dueno_service') then
    create policy esperas_del_dueno_service on public.esperas_del_dueno for all to service_role using (true) with check (true);
  end if;
end $$;
comment on table public.esperas_del_dueno is 'LA CADENA ESPERA AL DUEÑO: el flujo guarda el sobre que iba a mandar (esperando) y la aprobación lo suelta una sola vez (soltada). reemplazada = un alta más nueva del mismo cliente. Nada corre mientras espera.';
