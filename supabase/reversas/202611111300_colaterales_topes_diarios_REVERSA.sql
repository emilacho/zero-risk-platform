-- REVERSA de 202611111300_colaterales_topes_diarios.sql · borra SOLO la tabla del tope diario.
-- Ojo: sin esta tabla, el turno de colaterales frena siempre (no puede leer el tope): nunca gasta de más.
begin;
drop table if exists public.colaterales_topes_diarios;
commit;
