-- PERFIL DEL PÚBLICO · T1 (GO de Lenovo por Emilio 10-nov) · la tabla de VOCES del público, FUERA del cerebro.
-- Por qué no `client_voc_library`: esa tabla dispara `voc_library_brain_reembed` (re-embebe cada fila en el cerebro) y el texto raspado
-- de extraños no debe entrar al cerebro por esa puerta trasera. El perfil entra al cerebro SOLO por la puerta de informes.
-- Sin columnas de autor (ni nombre ni cuenta): la privacidad está en la forma de la tabla, no en una costumbre.
-- Nada se borra ni se reescribe: el servidor solo puede leer e insertar (sin duplicar: una voz = una huella por cliente).
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
grant select, insert on public.perfil_publico_voces to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'perfil_publico_voces' and policyname = 'perfil_publico_voces_service') then
    create policy perfil_publico_voces_service on public.perfil_publico_voces for all to service_role using (true) with check (true);
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
