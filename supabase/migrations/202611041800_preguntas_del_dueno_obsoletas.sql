-- 04-nov · firma de Emilio: las preguntas dejan Slack y se contestan en «Tu oficina»; las pendientes viejas se archivan como «obsoleta» (con fecha y motivo; nada se borra).
-- ADITIVA: amplía el CHECK de estado con 'obsoleta' y agrega dos columnas nulas; no toca filas. REVERSA: supabase/reversas/202611041800_preguntas_del_dueno_obsoletas_REVERSA.sql
--   (pasa antes a 'vencida' las que queden 'obsoleta', restaura el CHECK de 3 estados y quita las dos columnas).
alter table public.cerebro_dueno_preguntas add column if not exists obsoleta_en timestamptz, add column if not exists motivo_descarte text;
alter table public.cerebro_dueno_preguntas drop constraint if exists cerebro_dueno_preguntas_estado_check;
alter table public.cerebro_dueno_preguntas add constraint cerebro_dueno_preguntas_estado_check check (estado in ('pendiente','respondida','vencida','obsoleta'));
