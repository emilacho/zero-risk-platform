-- 06-nov · firma de Emilio (encargo «asumir pregunta del dueño»): una pregunta al dueño puede traer el SUPUESTO con que seguiría la oficina, y el dueño puede ASUMIRLO.
-- Asumir no es responder: la pregunta queda 'asumida' (estado propio) con el supuesto exacto, quién y cuándo. Lo asumido se lee como «supuesto aceptado por el dueño», nunca como dato del dueño.
-- ADITIVA: amplía el CHECK de estado con 'asumida' y agrega cuatro columnas nulas; no toca filas. REVERSA: supabase/reversas/202611061200_preguntas_del_dueno_asumida_REVERSA.sql
--   (pasa antes a 'obsoleta' las que queden 'asumida', con fecha y motivo; restaura el CHECK de 4 estados y quita las cuatro columnas).
alter table public.cerebro_dueno_preguntas
  add column if not exists supuesto jsonb,
  add column if not exists supuesto_asumido jsonb,
  add column if not exists asumida_en timestamptz,
  add column if not exists asumida_por text;
alter table public.cerebro_dueno_preguntas drop constraint if exists cerebro_dueno_preguntas_estado_check;
alter table public.cerebro_dueno_preguntas add constraint cerebro_dueno_preguntas_estado_check check (estado in ('pendiente','respondida','vencida','obsoleta','asumida'));
comment on column public.cerebro_dueno_preguntas.supuesto is 'el supuesto con que seguiría la oficina si el dueño no contesta: { texto, nombre?, valor?, unidad? }';
comment on column public.cerebro_dueno_preguntas.supuesto_asumido is 'copia exacta del supuesto en el momento en que el dueño lo asumió';
