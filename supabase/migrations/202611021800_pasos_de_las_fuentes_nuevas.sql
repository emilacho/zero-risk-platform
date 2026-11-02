-- 02-nov · encargo «seis fuentes nuevas de Apify»: cada fuente es un paso diario del portero con su propio renglón en cerebro_pasos_diarios.
-- ADITIVA: solo AMPLÍA la lista de pasos permitidos (los 4 de siempre siguen valiendo); no toca filas ni permisos.
-- REVERSA (solo si no hay filas de los pasos nuevos):
--   alter table public.cerebro_pasos_diarios drop constraint cerebro_pasos_diarios_paso_check;
--   alter table public.cerebro_pasos_diarios add constraint cerebro_pasos_diarios_paso_check check (paso in ('cuentas_y_comentarios','tendencias','bodega','transcripcion'));
alter table public.cerebro_pasos_diarios drop constraint if exists cerebro_pasos_diarios_paso_check;
alter table public.cerebro_pasos_diarios add constraint cerebro_pasos_diarios_paso_check check (paso in (
  'cuentas_y_comentarios','tendencias','bodega','transcripcion',
  'anuncios_google','busquedas_google','horas_de_mas_gente','eventos_locales','comentarios_ig_fb','foros'
));
