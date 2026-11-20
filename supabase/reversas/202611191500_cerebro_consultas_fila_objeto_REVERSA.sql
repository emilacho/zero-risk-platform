-- Reversa de 202611191500 · quita solo `fila_objeto` (la columna `fila` en texto queda).
alter table public.cerebro_consultas
  drop column if exists fila_objeto;
