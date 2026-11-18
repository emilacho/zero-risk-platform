-- REVERSA de 202611180300_borrar_perfil_publico_voces · vuelve a crear la tabla VACÍA tal como la dejaron 202611101300 + 202611101400
-- (mismas columnas, restricciones, índice, seguridad por fila, política y privilegios). Las filas no vuelven: no había ninguna.
begin;

create table if not exists public.perfil_publico_voces (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 600),
  fuente text not null check (fuente ~ '^[a-z][a-z0-9_]{1,59}$'),
  enlace text check (enlace is null or enlace ~* '^https?://'),
  fecha timestamptz,
  huella text not null check (huella ~ '^[0-9a-f]{32}$'),
  provenance_tag jsonb not null check (provenance_tag->>'trust_level' = 'untrusted'),
  workflow_execution_id text,
  created_at timestamptz not null default now(),
  constraint perfil_publico_voces_una_por_huella unique (client_id, huella)
);
create index if not exists perfil_publico_voces_cliente on public.perfil_publico_voces (client_id, created_at desc);

alter table public.perfil_publico_voces enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'perfil_publico_voces' and policyname = 'perfil_publico_voces_service') then
    create policy perfil_publico_voces_service on public.perfil_publico_voces for all to service_role using (true) with check (true);
  end if;
end $$;
revoke all on public.perfil_publico_voces from anon, authenticated;
revoke truncate, trigger, references, update, delete on public.perfil_publico_voces from service_role;
grant select, insert on public.perfil_publico_voces to service_role;

commit;
notify pgrst, 'reload schema';
