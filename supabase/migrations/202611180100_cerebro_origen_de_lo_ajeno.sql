-- ENCARGO 3 de Cerebro · fase B (17-nov, firma de Emilio) · DE DÓNDE VIENE LO AJENO, por fila: papel, vía de entrada, nivel del embudo y motivo de relevancia.
-- `owner_role` NO cambia (es parte de la clave única y lo leen las oficinas): la clasificación nueva va aparte, en `papel`, y la escribe el cerebro (código exacto, sin modelo).
--   papel: propio | competidor (solo por la lista de competidores o la búsqueda de competencia por rubro y ciudad) | mercado (cuentas halladas por un hashtag o por Mapas fuera de sus ciudades) | referencia (tendencias, bodega, anuncios)
--   via: por dónde entró · nivel: el del embudo · relevancia_motivo: por qué sirve a ESTE cliente; sin motivo → `sin_motivo` = true (la oficina lo ve aparte; nada se borra)
-- Reversa: supabase/reversas/202611180100_cerebro_origen_de_lo_ajeno_REVERSA.sql

alter table public.client_social_images add column if not exists papel text;
alter table public.client_social_images add column if not exists via text;
alter table public.client_social_images add column if not exists via_detalle text;
alter table public.client_social_images add column if not exists nivel text;
alter table public.client_social_images add column if not exists relevancia_motivo text;
alter table public.client_social_images add column if not exists clasificado_en timestamptz;
alter table public.client_social_images drop constraint if exists csi_papel_valido;
alter table public.client_social_images add constraint csi_papel_valido check (papel is null or papel in ('propio','competidor','mercado','referencia'));
alter table public.client_social_images drop constraint if exists csi_via_valida;
alter table public.client_social_images add constraint csi_via_valida check (via is null or via in ('cuenta_propia','lista_de_competidores','busqueda_de_competencia','mapas','hashtag','anuncios','tendencia','bodega','sitio','sin_registro'));
alter table public.client_social_images drop constraint if exists csi_nivel_valido;
alter table public.client_social_images add constraint csi_nivel_valido check (nivel is null or nivel in ('propio','mundo','global','pais','competencia','directa'));
alter table public.client_social_images drop constraint if exists csi_textos_cortos;
alter table public.client_social_images add constraint csi_textos_cortos check ((via_detalle is null or char_length(via_detalle) <= 300) and (relevancia_motivo is null or char_length(relevancia_motivo) <= 300));
-- la cuenta propia nunca es competidor ni referencia: `papel = propio` exige nivel propio
alter table public.client_social_images drop constraint if exists csi_propio_es_propio;
alter table public.client_social_images add constraint csi_propio_es_propio check (papel is distinct from 'propio' or nivel = 'propio');
-- clasificada = con papel y vía; sin motivo = ajena y sin motivo (columna calculada: no se puede escribir a mano)
alter table public.client_social_images drop constraint if exists csi_clasificada_completa;
alter table public.client_social_images add constraint csi_clasificada_completa check (clasificado_en is null or (papel is not null and via is not null and nivel is not null));
alter table public.client_social_images add column if not exists sin_motivo boolean generated always as (papel is not null and papel <> 'propio' and relevancia_motivo is null) stored;
create index if not exists csi_por_clasificar on public.client_social_images (client_id) where clasificado_en is null;

alter table public.client_videos add column if not exists papel text;
alter table public.client_videos add column if not exists via text;
alter table public.client_videos add column if not exists via_detalle text;
alter table public.client_videos add column if not exists nivel text;
alter table public.client_videos add column if not exists relevancia_motivo text;
alter table public.client_videos add column if not exists clasificado_en timestamptz;
alter table public.client_videos drop constraint if exists cv_papel_valido;
alter table public.client_videos add constraint cv_papel_valido check (papel is null or papel in ('propio','competidor','mercado','referencia'));
alter table public.client_videos drop constraint if exists cv_via_valida;
alter table public.client_videos add constraint cv_via_valida check (via is null or via in ('cuenta_propia','lista_de_competidores','busqueda_de_competencia','mapas','hashtag','anuncios','tendencia','bodega','sitio','sin_registro'));
alter table public.client_videos drop constraint if exists cv_nivel_valido;
alter table public.client_videos add constraint cv_nivel_valido check (nivel is null or nivel in ('propio','mundo','global','pais','competencia','directa'));
alter table public.client_videos drop constraint if exists cv_textos_cortos;
alter table public.client_videos add constraint cv_textos_cortos check ((via_detalle is null or char_length(via_detalle) <= 300) and (relevancia_motivo is null or char_length(relevancia_motivo) <= 300));
-- la cuenta propia nunca es competidor ni referencia: `papel = propio` exige nivel propio
alter table public.client_videos drop constraint if exists cv_propio_es_propio;
alter table public.client_videos add constraint cv_propio_es_propio check (papel is distinct from 'propio' or nivel = 'propio');
-- clasificada = con papel y vía; sin motivo = ajena y sin motivo (columna calculada: no se puede escribir a mano)
alter table public.client_videos drop constraint if exists cv_clasificada_completa;
alter table public.client_videos add constraint cv_clasificada_completa check (clasificado_en is null or (papel is not null and via is not null and nivel is not null));
alter table public.client_videos add column if not exists sin_motivo boolean generated always as (papel is not null and papel <> 'propio' and relevancia_motivo is null) stored;
create index if not exists cv_por_clasificar on public.client_videos (client_id) where clasificado_en is null;
