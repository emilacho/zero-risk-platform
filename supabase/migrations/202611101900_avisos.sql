-- AVISOS SIN SLACK · entrega A (CC1 · certifican CC7 código y CC6 permisos · GO Lenovo 16:14Z con «dale» de Emilio).
-- Un solo buzón de avisos del sistema en la base: piezas, preguntas y alarmas. El tablero lo lee; Slack queda detrás de un interruptor.
-- Un incidente = UNA FILA (CC6 §1): una sola fila ABIERTA por clave; al reabrir se crea otra y las cerradas quedan como historial.
-- La función `avisos_avisar` hace abrir / repetir / reabrir sin carreras: cierra la vencida y luego «insertar o, si ya hay abierta, contar repetición» en UNA sentencia (on conflict sobre el índice parcial).
-- Permisos (lección #985 + CC6 §2): primero se quita TODO a public, anon, authenticated y service_role; el servidor recibe leer, insertar y actualizar SOLO las columnas que cambian.
-- La función es `security invoker` (corre con los permisos del servidor) y solo el servidor la puede ejecutar. Nada se borra. Agnóstico: ningún dato de un cliente.
begin;

create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  clave text not null check (char_length(btrim(clave)) between 3 and 160),
  tipo text not null check (tipo in ('pieza', 'pregunta', 'alarma')),
  origen text not null check (char_length(btrim(origen)) between 1 and 200),
  origen_tipo text not null check (origen_tipo in ('n8n', 'plataforma')),
  client_id uuid references public.clients(id) on delete restrict,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  ultimo_detalle text not null check (char_length(ultimo_detalle) <= 2000),
  repeticiones integer not null default 0 check (repeticiones >= 0),
  abierto_en timestamptz not null default now(),
  ultima_en timestamptz not null default now(),
  cerrado_en timestamptz,
  nota_cierre text check (nota_cierre is null or char_length(nota_cierre) <= 300),
  workflow_id text check (workflow_id is null or char_length(workflow_id) <= 100),
  workflow_execution_id text check (workflow_execution_id is null or char_length(workflow_execution_id) <= 100),
  slack_ts text check (slack_ts is null or char_length(slack_ts) <= 40),
  slack_estado text not null default 'pendiente' check (slack_estado in ('pendiente', 'entregado', 'fallo', 'apagado')),
  slack_error text check (slack_error is null or char_length(slack_error) <= 300),
  -- lo que viene de n8n trae su firma completa (guardarraíl 4: rastro por corrida)
  constraint avisos_n8n_con_firma check (origen_tipo <> 'n8n' or (workflow_id is not null and workflow_execution_id is not null)),
  constraint avisos_cierre_con_nota check ((cerrado_en is null) = (nota_cierre is null))
);
-- una sola fila abierta por clave; las cerradas son historial
create unique index if not exists avisos_una_abierta_por_clave on public.avisos (clave) where cerrado_en is null;
create index if not exists avisos_recientes on public.avisos (ultima_en desc);

alter table public.avisos enable row level security;
revoke all on public.avisos from public, anon, authenticated, service_role;
grant select, insert on public.avisos to service_role;
-- update SOLO de lo que cambia al repetir, cerrar o anotar Slack; lo que identifica el incidente no se reescribe
grant update (repeticiones, ultimo_detalle, ultima_en, cerrado_en, nota_cierre, slack_ts, slack_estado, slack_error) on public.avisos to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos' and policyname = 'avisos_service') then
    create policy avisos_service on public.avisos for all to service_role using (true) with check (true);
  end if;
end $$;

-- abrir / repetir / reabrir · devuelve la fila abierta y qué pasó ('abrio' | 'repetida' | 'cambio' | 'reabrio')
--   · abierta con actividad en las últimas 24 h → suma una repetición ('cambio' si el detalle es otro, 'repetida' si es el mismo)
--   · abierta sin actividad en 24 h → se cierra con nota 'sin_actividad_24h' y se abre otra ('reabrio')
--   · sin abierta → se abre ('abrio')
create or replace function public.avisos_avisar(
  p_clave text, p_tipo text, p_origen text, p_origen_tipo text, p_client_id uuid, p_titulo text, p_detalle text,
  p_workflow_id text, p_workflow_execution_id text
) returns table (aviso_id uuid, accion text, slack_ts text, slack_estado text)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  vencida boolean;
  detalle_antes text;
  r record;
begin
  -- 1 · la abierta sin actividad en 24 h se cierra (queda como historial). Con dos llamadas a la vez, la segunda espera el bloqueo y ya no la encuentra abierta.
  update public.avisos a set cerrado_en = now(), nota_cierre = 'sin_actividad_24h'
    where a.clave = p_clave and a.cerrado_en is null and a.ultima_en <= now() - interval '24 hours';
  vencida := found;
  select a.ultimo_detalle into detalle_antes from public.avisos a where a.clave = p_clave and a.cerrado_en is null;
  -- 2 · abrir, o (si ya hay una abierta, aunque la haya abierto otra llamada en este mismo instante) contar una repetición. Una sola sentencia: sin carreras ni reintentos.
  insert into public.avisos as a (clave, tipo, origen, origen_tipo, client_id, titulo, ultimo_detalle, workflow_id, workflow_execution_id)
    values (p_clave, p_tipo, p_origen, p_origen_tipo, p_client_id, p_titulo, p_detalle, p_workflow_id, p_workflow_execution_id)
    on conflict (clave) where cerrado_en is null
    do update set repeticiones = a.repeticiones + 1, ultimo_detalle = excluded.ultimo_detalle, ultima_en = now()
    returning a.id, (a.xmax = 0) as nueva, a.slack_ts, a.slack_estado into r;
  return query select r.id,
    (case when r.nueva and vencida then 'reabrio' when r.nueva then 'abrio' when detalle_antes is not distinct from p_detalle then 'repetida' else 'cambio' end)::text,
    r.slack_ts, r.slack_estado;
end $$;

-- cerrar el incidente abierto de una clave (si no hay, no hace nada) · devuelve la fila cerrada
create or replace function public.avisos_cerrar(p_clave text, p_nota text)
returns table (aviso_id uuid, slack_ts text)
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  return query update public.avisos a set cerrado_en = now(), nota_cierre = left(coalesce(nullif(btrim(p_nota), ''), 'cerrado'), 300)
    where a.clave = p_clave and a.cerrado_en is null returning a.id, a.slack_ts;
end $$;

revoke execute on function public.avisos_avisar(text, text, text, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.avisos_cerrar(text, text) from public, anon, authenticated;
grant execute on function public.avisos_avisar(text, text, text, text, uuid, text, text, text, text) to service_role;
grant execute on function public.avisos_cerrar(text, text) to service_role;

commit;
notify pgrst, 'reload schema';
