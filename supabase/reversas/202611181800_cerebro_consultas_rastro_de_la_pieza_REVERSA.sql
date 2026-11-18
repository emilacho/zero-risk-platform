-- Reversa de 202611181800 · quita el rastro de la pieza de `cerebro_consultas` (las filas de hoy no se tocan; se pierden solo esas columnas).
drop index if exists public.cerebro_consultas_pieza;
alter table public.cerebro_consultas drop constraint if exists cerebro_consultas_ruta_check;
alter table public.cerebro_consultas
  drop column if exists numeros_no_consta,
  drop column if exists fichas_entregadas,
  drop column if exists hoja,
  drop column if exists turno,
  drop column if exists fila,
  drop column if exists encargo_id,
  drop column if exists ruta;
