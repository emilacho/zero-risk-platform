-- REVERSA de 202611050100_finanzas_preguntas_solo_registro · vuelve a enviar por Slack
update public.finanzas_config set preguntas_slack = 'envia' where preguntas_slack = 'registra';
alter table public.finanzas_config drop constraint if exists finanzas_config_preguntas_slack_check;
alter table public.finanzas_config add constraint finanzas_config_preguntas_slack_check check (preguntas_slack in ('apagado', 'borrador', 'envia'));
