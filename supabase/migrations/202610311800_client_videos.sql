-- Videos del cerebro (31-oct): el archivo del video se guarda COMO VIDEO en el almacén privado `client-videos`; las capturas de momentos clave vive en `client_social_images` (tipo video_captura) enlazada por video_id.
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-videos', 'client-videos', false, 52428800)
on conflict (id) do nothing;

create table if not exists public.client_videos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  owner_role text not null check (owner_role in ('propio','competidor','referencia')),
  handle text not null,
  post_id text not null,
  tipo text not null check (tipo in ('reel','video_feed','historia','anuncio','video_web')),
  estado text not null default 'ok' check (estado in ('ok','no_bajo')),
  causa text,
  path text,
  bytes bigint,
  hash_archivo text,
  duracion_s numeric,
  caption text,
  posted_at timestamptz,
  post_url text,
  fuente_url text,
  transcripcion text,
  metricas jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint cv_causa_si_no_bajo check (estado = 'ok' or causa is not null),
  unique (client_id, owner_role, handle, post_id)
);
create index if not exists client_videos_cliente on public.client_videos (client_id, owner_role);
alter table public.client_videos enable row level security;
grant select, insert, update on public.client_videos to service_role;

alter table public.client_social_images add column if not exists video_id uuid references public.client_videos(id) on delete set null;
