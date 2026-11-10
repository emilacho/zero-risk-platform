-- COLATERALES · tramo 2b (CC1 · certifica CC7/CC6 · PLAN tramo 2 + adenda 1) · el HISTORIAL de cada edición y de sus retoques.
-- Una edición = un trabajo: `llave` única (un reenvío choca y responde «ya en curso»); el paso recibida → en_curso es un update condicional del servidor.
-- Retoque: un pedazo de aguas abajo, con su documento, su versión base y su POSICIÓN (inicio o ruta JSON): se aplica ahí o queda pendiente, nunca se busca en todo el documento.
-- Un retoque frenado por la jefatura se rehace UNA vez (`rehechos` ≤ 1, línea 1 de CC6); si vuelve a fallar queda `rechazado` y el documento sigue como estaba.
-- El costo NO se escribe a mano: se calcula de los recibos de agent_invocations de la corrida (`workflow_execution_id`, línea 5 de CC7).
-- Permisos (lección #985 + línea 3 de CC6): primero se quita TODO a public, anon y authenticated; el servidor recibe solo leer, insertar y actualizar.
-- Nada se borra: ni el servidor tiene delete ni truncate. Agnóstico: ningún dato de un cliente.
begin;

create table if not exists public.colaterales_ediciones (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  documento text not null check (documento in ('manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza')),
  documento_ref text not null check (char_length(documento_ref) between 1 and 200),
  version_base text not null check (char_length(version_base) between 1 and 100),
  version_nueva text check (version_nueva is null or char_length(version_nueva) between 1 and 100),
  seccion text not null,
  antes text not null check (char_length(antes) between 1 and 4000),
  despues text not null check (char_length(despues) between 1 and 4000),
  estado text not null default 'recibida' check (estado in ('recibida', 'en_curso', 'lista', 'sin_colaterales', 'sin_motor', 'de_fondo', 'fallida')),
  gravedad text check (gravedad is null or gravedad in ('fondo', 'normal')),
  gravedad_motivo text,
  nota text,
  llave text not null check (char_length(llave) between 8 and 200),
  workflow_execution_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint colaterales_ediciones_antes_distinto check (antes <> despues),
  constraint colaterales_ediciones_una_por_llave unique (llave)
);
create index if not exists colaterales_ediciones_cliente on public.colaterales_ediciones (client_id, created_at desc);

create table if not exists public.colaterales_retoques (
  id uuid primary key default gen_random_uuid(),
  edicion_id uuid not null references public.colaterales_ediciones(id) on delete cascade,
  documento text not null check (documento in ('manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza')),
  documento_ref text not null check (char_length(documento_ref) between 1 and 200),
  version_base text not null check (char_length(version_base) between 1 and 100),
  pedazo_id text not null check (pedazo_id ~ '^C[0-9]{1,4}$'),
  pedazo_inicio integer not null check (pedazo_inicio >= -1),
  pedazo_ruta text,
  pedazo_texto text not null,
  seccion text not null,
  afecta boolean not null,
  razon text not null check (char_length(btrim(razon)) > 0),
  antes text,
  despues text,
  porque text,
  estado text not null check (estado in ('ya_coincide', 'descartado', 'propuesto', 'aprobado', 'rechazado', 'pendiente', 'aplicado', 'deshecho')),
  motivo text,
  rehechos smallint not null default 0 check (rehechos between 0 and 1),
  version_resultante text,
  revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- markdown va por posición (inicio ≥ 0, sin ruta); JSON va por ruta (inicio = -1)
  constraint colaterales_retoques_posicion_o_ruta check ((pedazo_ruta is null) = (pedazo_inicio >= 0)),
  -- todo lo que se propone trae antes y después distintos; lo resuelto sin agente o descartado no
  constraint colaterales_retoques_con_cambio check (estado in ('ya_coincide', 'descartado') or (antes is not null and despues is not null and antes <> despues)),
  constraint colaterales_retoques_un_pedazo_por_edicion unique (edicion_id, pedazo_id)
);
create index if not exists colaterales_retoques_edicion on public.colaterales_retoques (edicion_id);

alter table public.colaterales_ediciones enable row level security;
alter table public.colaterales_retoques enable row level security;
revoke all on public.colaterales_ediciones from public, anon, authenticated, service_role;
revoke all on public.colaterales_retoques from public, anon, authenticated, service_role;
grant select, insert, update on public.colaterales_ediciones to service_role;
grant select, insert, update on public.colaterales_retoques to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'colaterales_ediciones' and policyname = 'colaterales_ediciones_service') then
    create policy colaterales_ediciones_service on public.colaterales_ediciones for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'colaterales_retoques' and policyname = 'colaterales_retoques_service') then
    create policy colaterales_retoques_service on public.colaterales_retoques for all to service_role using (true) with check (true);
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
