-- Encargo 9 + adenda 1 (sin casillas) · 18-nov · el RASTRO de cada índice y cada entrega a una pieza de la mesa.
-- Aditiva: las consultas de hoy (`/api/brain/consultar`) siguen igual y quedan con estas columnas vacías.
-- Reversa: supabase/reversas/202611181800_cerebro_consultas_rastro_de_la_pieza_REVERSA.sql

alter table public.cerebro_consultas
  add column if not exists ruta text,
  add column if not exists encargo_id text,
  add column if not exists fila text,
  add column if not exists turno text,
  add column if not exists hoja text,
  add column if not exists fichas_entregadas jsonb,
  add column if not exists numeros_no_consta jsonb;

alter table public.cerebro_consultas drop constraint if exists cerebro_consultas_ruta_check;
alter table public.cerebro_consultas add constraint cerebro_consultas_ruta_check check (ruta is null or ruta in ('indice', 'entregar'));

-- qué buscó y qué recibió cada turno de una pieza
create index if not exists cerebro_consultas_pieza on public.cerebro_consultas (client_id, encargo_id, creado_en) where encargo_id is not null;
