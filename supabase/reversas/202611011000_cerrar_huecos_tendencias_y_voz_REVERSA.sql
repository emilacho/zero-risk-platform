-- Reversa de 202611011000: solo si no hay filas con client_id nulo.
drop table if exists public.cerebro_comentarios_competencia;
drop index if exists public.csi_bodega_unica;
drop index if exists public.client_videos_bodega_unica;
alter table public.client_social_images alter column client_id set not null;
alter table public.client_videos alter column client_id set not null;
