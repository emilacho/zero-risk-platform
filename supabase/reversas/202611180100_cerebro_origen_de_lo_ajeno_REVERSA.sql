-- REVERSA de 202611180100_cerebro_origen_de_lo_ajeno · quita las columnas nuevas (la limpieza tiene su propia reversa en la evidencia: duplicado_de)
drop index if exists public.csi_por_clasificar;
alter table public.client_social_images drop constraint if exists csi_papel_valido;
alter table public.client_social_images drop constraint if exists csi_via_valida;
alter table public.client_social_images drop constraint if exists csi_nivel_valido;
alter table public.client_social_images drop constraint if exists csi_textos_cortos;
alter table public.client_social_images drop constraint if exists csi_propio_es_propio;
alter table public.client_social_images drop constraint if exists csi_clasificada_completa;
alter table public.client_social_images drop column if exists sin_motivo, drop column if exists papel, drop column if exists via, drop column if exists via_detalle, drop column if exists nivel, drop column if exists relevancia_motivo, drop column if exists clasificado_en;
drop index if exists public.cv_por_clasificar;
alter table public.client_videos drop constraint if exists cv_papel_valido;
alter table public.client_videos drop constraint if exists cv_via_valida;
alter table public.client_videos drop constraint if exists cv_nivel_valido;
alter table public.client_videos drop constraint if exists cv_textos_cortos;
alter table public.client_videos drop constraint if exists cv_propio_es_propio;
alter table public.client_videos drop constraint if exists cv_clasificada_completa;
alter table public.client_videos drop column if exists sin_motivo, drop column if exists papel, drop column if exists via, drop column if exists via_detalle, drop column if exists nivel, drop column if exists relevancia_motivo, drop column if exists clasificado_en;
