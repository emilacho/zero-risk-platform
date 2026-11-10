-- REVERSA de 202611101500 · devuelve el estado medido el 10-nov: las 2 reglas con su texto exacto y los 7 privilegios a anon y authenticated.
begin;
create policy "Admin full access pipeline_executions" on public.pipeline_executions as permissive for all to public using (true) with check (true);
create policy "Admin full access pipeline_steps" on public.pipeline_steps as permissive for all to public using (true) with check (true);
grant all on public.pipeline_executions to anon, authenticated;
grant all on public.pipeline_steps to anon, authenticated;
commit;
