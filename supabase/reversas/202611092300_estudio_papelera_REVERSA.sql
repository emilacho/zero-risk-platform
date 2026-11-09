-- REVERSA de `202611092300_estudio_papelera.sql`. Lo que estaba en la papelera vuelve a la galería (la columna desaparece).
drop index if exists public.estudio_piezas_papelera;
alter table public.estudio_piezas drop column if exists en_papelera_desde;
