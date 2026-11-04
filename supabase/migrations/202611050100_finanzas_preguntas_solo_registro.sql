-- 05-nov · LAS PREGUNTAS AL DUEÑO DEJAN DE IR A SLACK (decisión de Emilio, 04-nov 16:20Z · GO de Lenovo) · CC1
-- Se contestan en Tu oficina › Decisiones. Se aplica DESPUÉS de publicar el código: el código anterior lee 'registra' como apagado.
-- REVERSA: `supabase/reversas/202611050100_finanzas_preguntas_solo_registro_REVERSA.sql`.
alter table public.finanzas_config drop constraint if exists finanzas_config_preguntas_slack_check;
alter table public.finanzas_config add constraint finanzas_config_preguntas_slack_check check (preguntas_slack in ('apagado', 'borrador', 'envia', 'registra'));
update public.finanzas_config set preguntas_slack = 'registra' where preguntas_slack = 'envia';
