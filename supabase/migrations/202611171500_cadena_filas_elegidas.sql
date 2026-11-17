-- 202611171500 · «PRODUCIR ESTAS FILAS» (RESPUESTA Lenovo 17-nov, opción A · mini-prueba) · el permiso de producir SOLO unas filas de una campaña PAUSADA.
-- La acción `filas · producir` de la cadena escribe aquí una fila por cada fila del calendario elegida, con su lote y un vencimiento; el flujo de brief («parte por filas»)
-- y `autoproducir` dejan pasar una campaña pausada SOLO si todas las filas del lote tienen su permiso vigente. La campaña sigue pausada: el reloj no suelta nada.
-- Nada se borra ni se reescribe: el servidor solo lee e inserta (un permiso = campaña + fila + lote). Reversa: supabase/reversas/202611171500_cadena_filas_elegidas_REVERSA.sql
begin;

create table if not exists public.cadena_filas_elegidas (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.cadena_campanas(id) on delete cascade,
  fila_id text not null check (char_length(fila_id) between 1 and 120),
  calendario_version integer not null check (calendario_version >= 1),
  lote text not null check (lote ~ '^elegidas-[0-9]{8}T[0-9]{4}$'),
  elegida_en timestamptz not null default now(),
  vence_en timestamptz not null,
  nota text check (nota is null or char_length(nota) <= 500),
  workflow_id text,
  workflow_execution_id text,
  constraint cadena_filas_elegidas_vence_despues check (vence_en > elegida_en),
  constraint cadena_filas_elegidas_una_por_lote unique (campana_id, fila_id, lote)
);
create index if not exists cadena_filas_elegidas_campana on public.cadena_filas_elegidas (campana_id, vence_en desc);

alter table public.cadena_filas_elegidas enable row level security;
-- los privilegios por omisión del esquema dan de más a anon/authenticated (y TRUNCATE salta la seguridad por fila): se quitan todos y solo el servidor lee e inserta
revoke all on public.cadena_filas_elegidas from anon, authenticated;
revoke all on public.cadena_filas_elegidas from service_role;
grant select, insert on public.cadena_filas_elegidas to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cadena_filas_elegidas' and policyname = 'cadena_filas_elegidas_service') then
    create policy cadena_filas_elegidas_service on public.cadena_filas_elegidas for all to service_role using (true) with check (true);
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
