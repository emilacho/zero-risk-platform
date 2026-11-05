-- 05-nov · EL ESTUDIO DE LA CÁMARA (dpto de marketing · GO de Lenovo tras boceto aprobado por Emilio) · CC3
-- Una fila por pieza creada desde el estudio (imagen · video · 3D). Toda pieza pertenece a un cliente.
-- `clave` = el clic: la misma clave no crea otra pieza ni cobra dos veces.
-- Las direcciones del proveedor (estado/resultado) se guardan aquí y solo las lee el servidor; nunca salen al navegador.
-- Solo el servidor (service_role) lee y escribe: el dashboard pasa por las rutas de la plataforma.
-- REVERSA: `supabase/reversas/202611052100_estudio_piezas_REVERSA.sql`.

create table if not exists public.estudio_piezas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  tipo text not null check (tipo in ('imagen', 'video', '3d')),
  estado text not null default 'creando' check (estado in ('creando', 'lista', 'fallida')),
  paso text check (paso is null or paso in ('imagen', 'video', '3d')),
  prompt text not null default '' check (char_length(prompt) <= 4000),
  modelo text not null,
  parametros jsonb not null default '{}'::jsonb,
  clave text not null,
  foto_partida_url text,
  proveedor_request_id text,
  proveedor_status_url text,
  proveedor_response_url text,
  costo_estimado_usd numeric(12,6) not null default 0 check (costo_estimado_usd >= 0),
  costo_usd numeric(12,6) not null default 0 check (costo_usd >= 0),
  archivo_url text,
  archivo_tipo text,
  miniatura_url text,
  aviso text,
  error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  terminado_en timestamptz
);
create unique index if not exists estudio_piezas_clave on public.estudio_piezas (clave);
create index if not exists estudio_piezas_cliente on public.estudio_piezas (client_id, creado_en desc);
create index if not exists estudio_piezas_creando on public.estudio_piezas (estado) where estado = 'creando';

alter table public.estudio_piezas enable row level security;
revoke all on public.estudio_piezas from public, anon, authenticated;
grant select, insert, update, delete on public.estudio_piezas to service_role;
do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.estudio_piezas'::regclass and polname = 'estudio_piezas_service') then
    create policy estudio_piezas_service on public.estudio_piezas for all to service_role using (true) with check (true);
  end if;
end $$;
