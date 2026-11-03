-- 03-nov · «TUS CAMBIOS» NO SE PIERDEN (Emilio, 18:13Z: eligió un eslogan, se le cerró el manual y la elección desapareció) · CC1
-- Un borrador por cliente y documento (manual o plan): lo que el dueño lleva marcado y aún no pidió, para retomarlo en este u otro equipo.
-- `documento_id` es la versión sobre la que lo hizo: si sale otra, el panel lo muestra como de la versión anterior y él decide. `acciones` es del panel: la plataforma la guarda tal cual.
create table if not exists public.borradores_del_dueno (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  documento text not null check (documento in ('manual', 'plan')),
  documento_id text not null,
  acciones jsonb not null,
  revision int not null default 1,
  actualizado_por text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (client_id, documento)
);
alter table public.borradores_del_dueno enable row level security;
revoke all on public.borradores_del_dueno from public, anon, authenticated;
grant select, insert, update, delete on public.borradores_del_dueno to service_role;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.borradores_del_dueno'::regclass and polname = 'borradores_del_dueno_service') then
    create policy borradores_del_dueno_service on public.borradores_del_dueno for all to service_role using (true) with check (true);
  end if;
end $$;
comment on table public.borradores_del_dueno is 'Lo que el dueño marcó en un documento y aún no pidió. Se borra al pedir con éxito o al descartar. Mientras exista, el manual no se aprueba.';
