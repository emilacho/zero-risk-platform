-- REVERSA de 202611111400_cadena_formatos_proporcion.sql · quita SOLO la columna de proporción.
-- Sin la columna, la hoja y la oficina usan la proporción por omisión del formato (hoja.ts PROPORCION_POR_FORMATO): ninguna pieza se frena.
begin;
alter table public.cadena_formatos_por_red drop constraint if exists cadena_formatos_proporcion_valida;
alter table public.cadena_formatos_por_red drop column if exists proporcion;
commit;
notify pgrst, 'reload schema';
