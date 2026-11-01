-- reversa de 202611011500 (solo si no hay nada que conservar)
alter table public.client_videos drop column if exists archivo_borrado_en;
drop table if exists public.cerebro_pasos_diarios;
