-- REVERSA de 202611180200_cerebro_juicio_de_relevancia.sql · quita el juicio de relevancia (columnas, restricciones e índices). No toca la fase B.
drop index if exists public.csi_por_juzgar;
alter table public.client_social_images drop constraint if exists csi_juicio_con_cliente;
alter table public.client_social_images drop constraint if exists csi_juicio_completo;
alter table public.client_social_images drop constraint if exists csi_juicio_valido;
alter table public.client_social_images drop column if exists relevancia_juicio_modelo;
alter table public.client_social_images drop column if exists relevancia_juzgada_en;
alter table public.client_social_images drop column if exists relevancia_juicio_motivo;
alter table public.client_social_images drop column if exists relevancia_juicio;

drop index if exists public.cv_por_juzgar;
alter table public.client_videos drop constraint if exists cv_juicio_con_cliente;
alter table public.client_videos drop constraint if exists cv_juicio_completo;
alter table public.client_videos drop constraint if exists cv_juicio_valido;
alter table public.client_videos drop column if exists relevancia_juicio_modelo;
alter table public.client_videos drop column if exists relevancia_juzgada_en;
alter table public.client_videos drop column if exists relevancia_juicio_motivo;
alter table public.client_videos drop column if exists relevancia_juicio;
