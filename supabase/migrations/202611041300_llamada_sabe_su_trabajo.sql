-- 04-nov · CADA LLAMADA GUARDA DE QUÉ TRABAJO ES (firma de Emilio 11:14Z, opción b): la sala debe saber quién aportó a cada
-- reunión sin adivinar por la hora. Columnas propias e indexadas, no un texto. Las filas viejas quedan en NULL = «sin dato»:
-- no se rellenan ni se deducen. Las restricciones son NOT VALID: valen para lo nuevo y no recorren el historial.
-- trabajo_tipo + trabajo_id: el trabajo raíz, siempre juntos · paso: el paso del flujo · llamada_padre: `id` de la llamada que originó esta.
alter table public.agent_invocations
  add column if not exists trabajo_tipo text,
  add column if not exists trabajo_id text,
  add column if not exists paso text,
  add column if not exists llamada_padre text;
alter table public.agent_dispatches
  add column if not exists trabajo_tipo text,
  add column if not exists trabajo_id text,
  add column if not exists paso text,
  add column if not exists llamada_padre text;

alter table public.agent_invocations drop constraint if exists agent_invocations_trabajo_check;
alter table public.agent_invocations add constraint agent_invocations_trabajo_check check (
  (trabajo_tipo is null and trabajo_id is null)
  or (trabajo_tipo in ('pedido', 'alta', 'plan', 'pieza') and trabajo_id is not null)
) not valid;
alter table public.agent_dispatches drop constraint if exists agent_dispatches_trabajo_check;
alter table public.agent_dispatches add constraint agent_dispatches_trabajo_check check (
  (trabajo_tipo is null and trabajo_id is null)
  or (trabajo_tipo in ('pedido', 'alta', 'plan', 'pieza') and trabajo_id is not null)
) not valid;

create index if not exists agent_invocations_trabajo_idx on public.agent_invocations (trabajo_tipo, trabajo_id, started_at) where trabajo_id is not null;
create index if not exists agent_invocations_paso_idx on public.agent_invocations (paso) where paso is not null;
create index if not exists agent_invocations_llamada_padre_idx on public.agent_invocations (llamada_padre) where llamada_padre is not null;
create index if not exists agent_dispatches_trabajo_idx on public.agent_dispatches (trabajo_tipo, trabajo_id, created_at) where trabajo_id is not null;
create index if not exists agent_dispatches_paso_idx on public.agent_dispatches (paso) where paso is not null;
create index if not exists agent_dispatches_llamada_padre_idx on public.agent_dispatches (llamada_padre) where llamada_padre is not null;

comment on column public.agent_invocations.trabajo_tipo is 'Clase del trabajo raíz: pedido | alta | plan | pieza. NULL = sin dato (corridas anteriores al 04-nov o llamador que no lo mandó).';
comment on column public.agent_invocations.trabajo_id is 'Id del trabajo raíz: plan_cambios.id, journey del alta, corrida del plan o id de la pieza.';
comment on column public.agent_invocations.paso is 'Paso del flujo. NULL = sin dato.';
comment on column public.agent_invocations.llamada_padre is 'invocation_id de la llamada que originó esta. NULL = sin padre o sin dato.';
comment on column public.agent_dispatches.trabajo_tipo is 'Clase del trabajo raíz: pedido | alta | plan | pieza. NULL = sin dato.';
comment on column public.agent_dispatches.trabajo_id is 'Id del trabajo raíz.';
comment on column public.agent_dispatches.paso is 'Paso del flujo. NULL = sin dato.';
comment on column public.agent_dispatches.llamada_padre is 'invocation_id de la llamada que originó esta. NULL = sin padre o sin dato.';
-- Reversa: drop de los 6 índices, de las 2 restricciones y de las 4 columnas en las dos tablas (nada más las usa).
