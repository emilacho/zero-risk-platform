-- reversa de 202611212000 (encargo 7): quita la columna `red`. El relleno tiene su propia reversa fina
-- (raw/evidencia/2026-11-21-encargo-7-red-y-carpetas/), que devuelve a NULL los ids tocados sin quitar la columna.
alter table client_social_images drop column if exists red;
alter table client_videos drop column if exists red;
alter table cerebro_fichas drop column if exists red;
