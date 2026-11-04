-- REVERSA de 202611041800_preguntas_del_dueno_obsoletas.sql · primero pasa a 'vencida' las que quedaron 'obsoleta'
update public.cerebro_dueno_preguntas set estado = 'vencida' where estado = 'obsoleta';
alter table public.cerebro_dueno_preguntas drop constraint if exists cerebro_dueno_preguntas_estado_check;
alter table public.cerebro_dueno_preguntas add constraint cerebro_dueno_preguntas_estado_check check (estado in ('pendiente','respondida','vencida'));
alter table public.cerebro_dueno_preguntas drop column if exists obsoleta_en, drop column if exists motivo_descarte;
