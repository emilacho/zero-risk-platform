-- Cerebro · paso 3 · las dos funciones del cerebro que escriben o corren como dueño ya no las llama la web
-- Encargo firmado por Emilio 10-nov (raw/tasks/2026-11-10-ENCARGO-CEREBRO-CC-CEREBRO-cerrar-permisos-del-cerebro.md) · CC-CEREBRO
-- brain_reembed_source_row: corre como dueño (SECURITY DEFINER) y no fijaba search_path; es la del disparador del re-índice (lo dispara la escritura del servidor, no pide EXECUTE).
-- prepare_voc_content: escribe en client_voc_library. El servidor y el dueño conservan EXECUTE.
begin;
revoke execute on function public.brain_reembed_source_row() from public, anon, authenticated;
alter function public.brain_reembed_source_row() set search_path = pg_catalog, pg_temp;
revoke execute on function public.prepare_voc_content(uuid) from public, anon, authenticated;
commit;
