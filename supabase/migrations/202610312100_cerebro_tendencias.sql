-- Tendencias (31-oct): lo más gustado/visto de afuera, con su NIVEL del embudo (global > país > competencia > directa); client_id NULL = bodega viral del mundo (espacio común).
create table if not exists public.cerebro_tendencias (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  nivel text not null check (nivel in ('global','pais','competencia','directa','mundo')),
  red text not null check (red in ('tiktok','instagram','x','linkedin','pinterest','youtube','facebook')),
  origen text not null check (origen in ('referencia','competidor')),
  subcategoria text not null default 'tendencia',
  consulta text not null,
  post_ref text not null,
  url text,
  autor text,
  texto text,
  tipo text not null default 'post' check (tipo in ('video','imagen','post','sonido','hashtag')),
  media_url text,
  video_id uuid references public.client_videos(id) on delete set null,
  vistas bigint,
  me_gusta bigint,
  compartidos bigint,
  comentarios bigint,
  metricas jsonb not null default '{}'::jsonb,
  pais text,
  publicado_en timestamptz,
  observado_en timestamptz not null default now(),
  observado_dia date not null default current_date,
  created_at timestamptz not null default now()
);
-- el historial NO se borra: una fila por pieza y por día observado; lo vigente es lo del último día
-- (la bodega, con client_id nulo, se protege de repetirse mirando una vez por día)
create unique index if not exists cerebro_tendencias_unica on public.cerebro_tendencias (client_id, red, post_ref, observado_dia);
create index if not exists cerebro_tendencias_lectura on public.cerebro_tendencias (client_id, observado_dia desc, nivel, me_gusta desc);
alter table public.cerebro_tendencias enable row level security;
grant select, insert, update on public.cerebro_tendencias to service_role;
