-- ENCARGO 4 de Cerebro (18-nov, firma de Emilio) · EL JUICIO DE RELEVANCIA de lo ajeno: un empleado (Haiku 4.5) dice si cada foto o video ajeno SIRVE al rubro y a la oferta del cliente.
-- Va en columnas PROPIAS: nunca toca `papel`, `via`, `nivel` ni `relevancia_motivo` (la fase B). Lo dudoso queda marcado «dudoso» con su motivo: NO va a revisión de una persona (cambio de Emilio).
-- La bodega del mundo (client_id nulo) no se juzga: lo exige la restricción `*_juicio_con_cliente`.
-- Reversa: supabase/reversas/202611180200_cerebro_juicio_de_relevancia_REVERSA.sql

alter table public.client_social_images add column if not exists relevancia_juicio text;
alter table public.client_social_images add column if not exists relevancia_juicio_motivo text;
alter table public.client_social_images add column if not exists relevancia_juzgada_en timestamptz;
alter table public.client_social_images add column if not exists relevancia_juicio_modelo text;
alter table public.client_social_images drop constraint if exists csi_juicio_valido;
alter table public.client_social_images add constraint csi_juicio_valido check (relevancia_juicio is null or relevancia_juicio in ('sirve','no_sirve','dudoso'));
alter table public.client_social_images drop constraint if exists csi_juicio_completo;
alter table public.client_social_images add constraint csi_juicio_completo check (relevancia_juicio is null or (relevancia_juicio_motivo is not null and char_length(relevancia_juicio_motivo) between 1 and 300 and relevancia_juzgada_en is not null and relevancia_juicio_modelo is not null));
alter table public.client_social_images drop constraint if exists csi_juicio_con_cliente;
alter table public.client_social_images add constraint csi_juicio_con_cliente check (relevancia_juicio is null or (client_id is not null and papel is not null and papel <> 'propio'));
create index if not exists csi_por_juzgar on public.client_social_images (client_id) where relevancia_juicio is null and papel is not null and papel <> 'propio';

alter table public.client_videos add column if not exists relevancia_juicio text;
alter table public.client_videos add column if not exists relevancia_juicio_motivo text;
alter table public.client_videos add column if not exists relevancia_juzgada_en timestamptz;
alter table public.client_videos add column if not exists relevancia_juicio_modelo text;
alter table public.client_videos drop constraint if exists cv_juicio_valido;
alter table public.client_videos add constraint cv_juicio_valido check (relevancia_juicio is null or relevancia_juicio in ('sirve','no_sirve','dudoso'));
alter table public.client_videos drop constraint if exists cv_juicio_completo;
alter table public.client_videos add constraint cv_juicio_completo check (relevancia_juicio is null or (relevancia_juicio_motivo is not null and char_length(relevancia_juicio_motivo) between 1 and 300 and relevancia_juzgada_en is not null and relevancia_juicio_modelo is not null));
alter table public.client_videos drop constraint if exists cv_juicio_con_cliente;
alter table public.client_videos add constraint cv_juicio_con_cliente check (relevancia_juicio is null or (client_id is not null and papel is not null and papel <> 'propio'));
create index if not exists cv_por_juzgar on public.client_videos (client_id) where relevancia_juicio is null and papel is not null and papel <> 'propio';
