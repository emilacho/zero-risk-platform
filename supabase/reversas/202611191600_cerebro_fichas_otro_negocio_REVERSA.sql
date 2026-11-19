-- Reversa de 202611191600 · quita la marca «no es de este cliente» de `cerebro_fichas` (las fichas no se tocan; se pierden solo las marcas).
-- Si ya se marcaron fichas, ANTES guardar el respaldo: raw/evidencia/2026-11-19-encargo-10-sedes-ajenas/.
drop index if exists public.cerebro_fichas_otro_negocio;
alter table public.cerebro_fichas drop constraint if exists cerebro_fichas_otro_negocio_entera;
alter table public.cerebro_fichas drop constraint if exists cerebro_fichas_otro_negocio_nivel_check;
alter table public.cerebro_fichas drop constraint if exists cerebro_fichas_otro_negocio_como_check;
alter table public.cerebro_fichas
  drop column if exists otro_negocio_en,
  drop column if exists otro_negocio_por,
  drop column if exists otro_negocio_nivel,
  drop column if exists otro_negocio_como,
  drop column if exists otro_negocio_prueba,
  drop column if exists otro_negocio_motivo;
