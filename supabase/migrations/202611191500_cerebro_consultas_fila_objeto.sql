-- 19-nov · DECISION-CEREBRO punto 2 · la fila de la pieza puede llegar como el objeto real del calendario `{id, hora, fecha}`.
-- `fila` (text, de 202611181800) guarda su id; esta columna guarda el objeto ENTERO tal como llegó. Aditiva; las filas de hoy quedan con null.
-- Va DESPUÉS de 202611181800 (la que crea `fila`). Reversa: supabase/reversas/202611191500_cerebro_consultas_fila_objeto_REVERSA.sql

alter table public.cerebro_consultas
  add column if not exists fila_objeto jsonb;
