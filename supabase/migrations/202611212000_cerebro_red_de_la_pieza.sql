-- encargo 7 (21-nov) · la etiqueta `red` en fotos, videos y fichas del cerebro.
-- Aditiva: solo agrega la columna (texto, sin valor por defecto). Nada se corta ni se toca lo guardado;
-- lo ya guardado lo llena el relleno con respaldo y reversa (raw/evidencia/2026-11-21-encargo-7-red-y-carpetas/).
-- Sin dato → null («no consta»).
alter table client_social_images add column if not exists red text;
alter table client_videos add column if not exists red text;
alter table cerebro_fichas add column if not exists red text;
