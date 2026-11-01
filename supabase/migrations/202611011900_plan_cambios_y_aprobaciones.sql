-- 01-nov · CICLO DEL PLAN · tramo 2 (ORDEN Lenovo 12:36Z firmada por Emilio · ítems 1-3) · CC1
-- Dos tablas propias (NO hitl_queue):
--   plan_aprobaciones · la COMPUERTA: una fila por versión del plan, creada por el flujo de planeación en el corte `plan_revisado` (después de la
--                       jefatura, antes del PDF y del brief). Guarda el sobre con que se reanuda la segunda mitad cuando el dueño aprueba.
--   plan_cambios      · lo que el dueño PIDE cambiar sobre un plan (texto libre). El redactor reescribe SOBRE ese plan; sale una versión nueva.
-- La versión del plan y «reemplaza a» viven en `client_historical_outputs.provenance_tag` (version · reemplaza_a · vigente · superseded_por): cero DDL
-- sobre esa tabla (su CHECK de status no admite `superseded`; la anterior se marca por el tag y NO se borra).
create table if not exists public.plan_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  plan_id uuid not null references public.client_historical_outputs (id),
  version int not null default 1 check (version >= 1),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'cambios_pedidos', 'reemplazado')),
  sobre_de_reanudacion jsonb not null default '{}'::jsonb,
  decidido_por text,
  decidido_en timestamptz,
  comentario text,
  despertado boolean,
  despertar_detalle text,
  workflow_id text,
  workflow_execution_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (plan_id)
);
create index if not exists plan_aprobaciones_cliente_estado on public.plan_aprobaciones (client_id, estado);
alter table public.plan_aprobaciones enable row level security;
revoke all on public.plan_aprobaciones from public, anon, authenticated;
grant select, insert, update on public.plan_aprobaciones to service_role;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.plan_aprobaciones'::regclass and polname = 'plan_aprobaciones_service') then
    create policy plan_aprobaciones_service on public.plan_aprobaciones for all to service_role using (true) with check (true);
  end if;
end $$;
comment on table public.plan_aprobaciones is 'CICLO DEL PLAN · la compuerta: una fila por versión del plan, creada en el corte plan_revisado. pendiente → aprobado (plan-aprobar reanuda PDF → brief) · cambios_pedidos (plan-cambios) · reemplazado (salió una versión nueva).';

create table if not exists public.plan_cambios (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  plan_id uuid not null references public.client_historical_outputs (id),
  vuelta int not null check (vuelta between 1 and 3),
  texto text not null check (char_length(texto) between 5 and 4000),
  pedido_por text not null,
  tope_usd numeric(8, 2) not null check (tope_usd > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_reescritura', 'aplicado', 'fallido', 'cancelado')),
  plan_nuevo_id uuid references public.client_historical_outputs (id),
  despertado boolean,
  despertar_detalle text,
  workflow_id text,
  workflow_execution_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists plan_cambios_cliente_estado on public.plan_cambios (client_id, estado);
create index if not exists plan_cambios_plan on public.plan_cambios (plan_id);
-- un solo pedido abierto por plan: el segundo espera a que vuelva la versión nueva
create unique index if not exists plan_cambios_un_abierto_por_plan on public.plan_cambios (plan_id) where estado in ('pendiente', 'en_reescritura');
alter table public.plan_cambios enable row level security;
revoke all on public.plan_cambios from public, anon, authenticated;
grant select, insert, update on public.plan_cambios to service_role;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.plan_cambios'::regclass and polname = 'plan_cambios_service') then
    create policy plan_cambios_service on public.plan_cambios for all to service_role using (true) with check (true);
  end if;
end $$;
comment on table public.plan_cambios is 'CICLO DEL PLAN · lo que el dueño pidió cambiar sobre un plan (texto libre, vuelta 1-3). El flujo de planeación lo toma (en_reescritura), reescribe SOBRE el plan y deja plan_nuevo_id (aplicado). Tope de 3 vueltas: después se decide a mano.';
