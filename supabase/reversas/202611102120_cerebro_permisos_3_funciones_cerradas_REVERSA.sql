-- REVERSA de 202611102120_cerebro_permisos_3_funciones_cerradas: devuelve EXECUTE a public/anon/authenticated y quita el search_path fijado (como estaba el 10-nov)
begin;
grant execute on function public.brain_reembed_source_row() to public, anon, authenticated;
alter function public.brain_reembed_source_row() reset search_path;
grant execute on function public.prepare_voc_content(uuid) to public, anon, authenticated;
commit;
