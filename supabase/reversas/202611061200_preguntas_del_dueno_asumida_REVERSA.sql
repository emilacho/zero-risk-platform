-- REVERSA de 202611061200_preguntas_del_dueno_asumida.sql · primero pasa a 'obsoleta' las que quedaron 'asumida' (con fecha y motivo: nada se borra)
-- Las fichas «supuesto aceptado por el dueño» que ya se guardaron NO se tocan: siguen leyéndose como supuesto aceptado (su clase lo dice), nunca como dato del dueño.
update public.cerebro_dueno_preguntas set estado = 'obsoleta', obsoleta_en = coalesce(asumida_en, now()), motivo_descarte = 'reversa de 202611061200: estaba asumida (supuesto aceptado por el dueño)' where estado = 'asumida';
alter table public.cerebro_dueno_preguntas drop constraint if exists cerebro_dueno_preguntas_estado_check;
alter table public.cerebro_dueno_preguntas add constraint cerebro_dueno_preguntas_estado_check check (estado in ('pendiente','respondida','vencida','obsoleta'));
alter table public.cerebro_dueno_preguntas drop column if exists supuesto, drop column if exists supuesto_asumido, drop column if exists asumida_en, drop column if exists asumida_por;
