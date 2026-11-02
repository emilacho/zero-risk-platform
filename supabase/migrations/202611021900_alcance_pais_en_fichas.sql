-- 02-nov · las fuentes nuevas (búsquedas de Google, eventos de las ciudades) describen el PAÍS del cliente: su alcance es «pais» (nivel del embudo «país»).
-- ADITIVA: solo AMPLÍA la lista de alcances permitidos; no toca filas.
-- REVERSA (solo si no hay fichas con alcance pais):
--   alter table public.cerebro_fichas drop constraint cerebro_fichas_alcance_valido;
--   alter table public.cerebro_fichas add constraint cerebro_fichas_alcance_valido check (alcance is null or alcance in ('cliente','competidor','mercado','zona','industria','formato','general'));
alter table public.cerebro_fichas drop constraint if exists cerebro_fichas_alcance_valido;
alter table public.cerebro_fichas add constraint cerebro_fichas_alcance_valido check (alcance is null or alcance in ('cliente','competidor','mercado','zona','industria','formato','general','pais'));
