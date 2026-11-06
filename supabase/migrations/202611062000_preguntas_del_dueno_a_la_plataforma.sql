-- 06-nov · ADENDA firmada por Emilio (#940): las PREGUNTAS al dueño salen del cerebro y viven en la plataforma (`public.dueno_preguntas`, la crea CC1).
-- Esta migración MUEVE cada fila de `cerebro_dueno_preguntas` a `dueno_preguntas` con el MISMO id, su estado y su motivo; no se pierde ninguna respuesta.
--   · respondida → `respuesta` sale de la ficha del dueño que la guardó (cerebro_fichas.provenance_tag->datos->respuesta), `ficha_ref` = esa ficha, `decidido_en` = respondida_en.
--     Si a una respondida le falta su ficha, la base rechaza la fila (respondida exige respuesta) y la migración entera se deshace: antes se corre
--     `scripts/ops/preguntas-del-dueno-chequeo.mjs` (respaldo + chequeo en seco), que lo dice antes de tocar nada.
--   · obsoleta → `motivo` = motivo_descarte (o un motivo que lo declara si faltaba), `decidido_en` = obsoleta_en.
--   · vencida / pendiente → igual, con su fecha de creación.
-- Al final la tabla vieja queda de SOLO LECTURA (sin permisos de escritura + un disparador que rechaza con un mensaje claro). No se borra nada:
-- se retira con su motivo después del 🟢 de la comparación.
-- ORDEN: corre DESPUÉS de la migración de CC1 que crea `dueno_preguntas` (si no existe, se detiene). REVERSA: supabase/reversas/202611062000_preguntas_del_dueno_a_la_plataforma_REVERSA.sql
begin;

do $$ begin
  if to_regclass('public.dueno_preguntas') is null then
    raise exception 'falta public.dueno_preguntas (la crea CC1): esta migración va después';
  end if;
end $$;

insert into public.dueno_preguntas (
  id, client_id, sede_clave, tema, tema_norm, pregunta, supuesto, canal, oficina, agente, workflow_id, workflow_execution_id,
  estado, respuesta, decidido_por, decidido_en, motivo, ficha_ref, creado_en, actualizado_en
)
select
  p.id, p.client_id, p.sede_clave, p.tema, p.tema_norm, p.pregunta, null, p.canal, p.preguntado_por_oficina, p.preguntado_por_agente, p.workflow_id, p.workflow_execution_id,
  p.estado,
  case when p.estado = 'respondida' then nullif(f.provenance_tag->'datos'->>'respuesta', '') end,
  case when p.estado = 'respondida' then 'dueno' end,
  case p.estado when 'respondida' then p.respondida_en when 'obsoleta' then p.obsoleta_en end,
  case
    when p.estado = 'obsoleta' then coalesce(nullif(p.motivo_descarte, ''), 'archivada como obsoleta sin motivo escrito (migrada del cerebro el 06-nov)')
    when p.estado = 'vencida' then 'vencida en el cerebro (migrada el 06-nov)'
  end,
  case when p.estado = 'respondida' then p.ficha_id end,
  p.creado_en,
  coalesce(p.respondida_en, p.obsoleta_en, p.creado_en)
from public.cerebro_dueno_preguntas p
left join public.cerebro_fichas f on f.id = p.ficha_id
on conflict (id) do nothing;

-- comprobación: cada fila vieja está en la nueva con el mismo estado; cada respondida trae su respuesta y su ficha
do $$
declare faltan int; distintas int; sin_respuesta int;
begin
  select count(*) into faltan from public.cerebro_dueno_preguntas p where not exists (select 1 from public.dueno_preguntas d where d.id = p.id);
  select count(*) into distintas from public.cerebro_dueno_preguntas p join public.dueno_preguntas d on d.id = p.id where d.estado <> p.estado;
  select count(*) into sin_respuesta from public.dueno_preguntas d join public.cerebro_dueno_preguntas p on p.id = d.id
    where p.estado = 'respondida' and (coalesce(d.respuesta, '') = '' or d.ficha_ref is distinct from p.ficha_id);
  if faltan > 0 or distintas > 0 or sin_respuesta > 0 then
    raise exception 'migración incompleta: % sin mover, % con otro estado, % respondidas sin respuesta o sin ficha', faltan, distintas, sin_respuesta;
  end if;
end $$;

-- la tabla vieja queda de solo lectura
revoke insert, update, delete on public.cerebro_dueno_preguntas from service_role, authenticated, anon;
create or replace function public.cerebro_dueno_preguntas_solo_lectura() returns trigger language plpgsql as $$
begin
  raise exception 'cerebro_dueno_preguntas es de solo lectura desde el 06-nov: las preguntas al dueño viven en public.dueno_preguntas (POST /api/dueno/preguntas)';
end $$;
drop trigger if exists cerebro_dueno_preguntas_solo_lectura on public.cerebro_dueno_preguntas;
create trigger cerebro_dueno_preguntas_solo_lectura before insert or update or delete on public.cerebro_dueno_preguntas
  for each statement execute function public.cerebro_dueno_preguntas_solo_lectura();
comment on table public.cerebro_dueno_preguntas is 'SOLO LECTURA desde 2026-11-06: sus filas se movieron a public.dueno_preguntas (mismo id). Se retira con su motivo tras el 🟢; no se borra.';

commit;
