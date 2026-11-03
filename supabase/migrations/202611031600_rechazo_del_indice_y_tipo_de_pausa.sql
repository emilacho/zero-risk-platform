-- 03-nov · (1) cerebro_fichas: el filtro de entrada del índice puede rechazar el texto de una ficha; se MARCA en la ficha (cuándo y por qué) y se declara como hueco, en vez de quedar «pendiente» para siempre.
--          (2) cerebro_portero_pausas: el tipo de la pausa (p. ej. 'borrado'): las pausas por borrado esperan al fin del alta (aviso a las 3 h, cierre solo a las 24 h sin alta).
-- ADITIVA: solo columnas nuevas, nulas por omisión; no toca filas. REVERSA:
--   alter table public.cerebro_fichas drop column if exists indice_rechazado_en, drop column if exists indice_rechazo;
--   alter table public.cerebro_portero_pausas drop column if exists motivo_tipo;
alter table public.cerebro_fichas add column if not exists indice_rechazado_en timestamptz, add column if not exists indice_rechazo text;
alter table public.cerebro_portero_pausas add column if not exists motivo_tipo text;
