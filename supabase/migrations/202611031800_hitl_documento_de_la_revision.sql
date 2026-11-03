-- 03-nov · CADA REVISIÓN VA AL PANEL DE SU DOCUMENTO (auditoría n.º 5 · firma de Emilio 17:43Z) · CC1
-- `documento` es una columna calculada: ningún flujo la escribe y ninguno puede saltársela, sirve para cualquier cliente y no cambia ningún dato de la fila.
-- La revisión del editor no dice de qué documento es: se reconoce por el pedido o por la forma de la salida. Lo que no se reconoce queda 'otro': nunca cae en el Manual ni en Piezas por error.
create or replace function public.documento_de_la_revision(tipo text, contexto text, salida text) returns text
language sql immutable as $$
  select case
    when tipo = 'content_piece_review' then 'pieza'
    when tipo = 'manual_de_marca_review' then 'manual'
    when tipo in ('plan_con_pendientes', 'palabra_del_dueno') then 'plan'
    when tipo = 'concepto_review' then 'gran_idea'
    when tipo = 'confirm_competitor_list' then 'competidores'
    when tipo = 'editor_escalation' then case
      when contexto ~ '^\s*(Construye TU sección del brand book|Eres el DUEÑO )' or salida ~ 'emit_brand_section' then 'manual'
      when contexto ~ '^\s*# Mesa de trabajo' or salida ~ '^\s*```json\s*\{\s*"(elementos|texto_base)"' then 'pieza'
      else 'otro'
    end
    else 'otro'
  end
$$;
alter table public.hitl_queue add column if not exists documento text generated always as (public.documento_de_la_revision(type, review_context, output_preview)) stored;
create index if not exists hitl_queue_documento_pendiente on public.hitl_queue (documento) where status = 'pending';
comment on column public.hitl_queue.documento is 'A qué documento pertenece la revisión y, por tanto, en qué panel se ve: pieza · manual · plan · gran_idea · competidores · otro. Calculada; no se escribe.';
