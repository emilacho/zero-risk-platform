-- 04-nov · LA MESA DE ESTRATEGIA DEL PLAN (GO de Lenovo 18:07Z, armado aprobado por Emilio) · CC1
-- Nace apagada: `finanzas_config.mesa_de_estrategia` en false. Con ella apagada, el plan es el de hoy.
-- Misma forma que `finanzas_encargos/turnos/artefactos`, pero aparte: allí solo cabe un encargo abierto por cliente, y la mesa vive antes que finanzas y no comparte su estado.
-- REVERSA: `supabase/reversas/202611041900_mesa_de_estrategia_REVERSA.sql`.

create table if not exists public.estrategia_encargos (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  estado text not null default 'abierto' check (estado in ('abierto', 'en_curso', 'cerrado', 'sin_acuerdo', 'cierre_por_tope', 'fallido')),
  estado_del_motor jsonb not null default '{}'::jsonb,
  gasto_usd numeric(10,4) not null default 0 check (gasto_usd >= 0),
  slack_canal text,
  slack_ts text,
  leido_hasta text,
  tablero_id text,
  dry_run boolean not null default false,
  semilla jsonb not null default '{}'::jsonb,
  en_vuelo_desde timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists estrategia_encargos_uno_abierto_por_cliente on public.estrategia_encargos (client_id) where estado in ('abierto', 'en_curso');

create table if not exists public.estrategia_turnos (
  id uuid primary key default gen_random_uuid(),
  encargo_id uuid not null references public.estrategia_encargos(id) on delete cascade,
  n integer not null check (n > 0),
  paso text not null,
  agente text,
  ronda integer not null default 1,
  estado text not null check (estado in ('hecho', 'fallo')),
  costo_usd numeric(10,4) not null default 0 check (costo_usd >= 0),
  salida jsonb,
  error text,
  creado_en timestamptz not null default now(),
  unique (encargo_id, n)
);

create table if not exists public.estrategia_artefactos (
  id uuid primary key default gen_random_uuid(),
  encargo_id uuid not null references public.estrategia_encargos(id) on delete cascade,
  tipo text not null,
  version integer not null default 1 check (version > 0),
  contenido jsonb not null,
  sha256 text,
  creado_en timestamptz not null default now(),
  unique (encargo_id, tipo, version)
);

do $$
declare t text;
begin
  foreach t in array array['estrategia_encargos', 'estrategia_turnos', 'estrategia_artefactos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    if not exists (select 1 from pg_policy where polrelid = ('public.' || t)::regclass and polname = t || '_service') then
      execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service', t);
    end if;
  end loop;
end $$;

alter table public.finanzas_config add column if not exists mesa_de_estrategia boolean not null default false;

-- el cupo que exige el pre-vuelo cuenta también la mesa
insert into public.plan_catalogo_topes (tope_id, tramo, fuente_id, usd, contador, version, vigente, pais)
  select 'tope_mesa', 'mesa', null, 3, 'plantilla_mesa', 1, true, null
  where not exists (select 1 from public.plan_catalogo_topes where tope_id = 'tope_mesa');

comment on table public.estrategia_encargos is 'La mesa de estrategia de marketing del plan: un encargo por corrida. Termina en un acta que lee finanzas y el redactor.';
