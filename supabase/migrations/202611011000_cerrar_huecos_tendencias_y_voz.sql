-- Cerrar huecos de tendencias y voz (01-nov).
-- 1) Videos y capturas de la BODEGA del mundo: no son de un cliente (client_id nulo). El historial no se borra; lo ya guardado de un cliente no cambia.
alter table public.client_videos alter column client_id drop not null;
alter table public.client_social_images alter column client_id drop not null;
-- con client_id nulo el UNIQUE normal no frena repetidos (null != null): índices parciales para el espacio común
create unique index if not exists client_videos_bodega_unica on public.client_videos (owner_role, handle, post_id) where client_id is null;
create unique index if not exists csi_bodega_unica on public.client_social_images (owner_role, handle, post_id) where client_id is null;

-- 2) Comentarios de la COMPETENCIA (TikTok, Facebook, X, Instagram): son de terceros sobre OTRA cuenta, no opiniones sobre el cliente; viven aparte con su fecha real y sin vencer.
create table if not exists public.cerebro_comentarios_competencia (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  red text not null check (red in ('tiktok','instagram','x','facebook')),
  cuenta text not null,
  post_ref text not null,
  post_url text,
  comentario_ref text not null,
  texto text not null,
  me_gusta bigint,
  fecha_comentario timestamptz,
  observado_en timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_id, red, comentario_ref)
);
create index if not exists cerebro_comentarios_competencia_lectura on public.cerebro_comentarios_competencia (client_id, red, fecha_comentario desc);
alter table public.cerebro_comentarios_competencia enable row level security;
grant select, insert, update on public.cerebro_comentarios_competencia to service_role;
