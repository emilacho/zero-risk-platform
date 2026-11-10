-- CIERRE DE PERMISOS · PASO 1 (GO de Lenovo, «dale» de Emilio 10-nov 14:20Z) · pipeline_executions y pipeline_steps
-- Medido el 10-nov (has_table_privilege + pg_policies): las dos tablas tienen una regla «Admin full access …» que en realidad
-- dice sí a TODOS (roles {public}, using true, with check true), así que con la llave pública de la web cualquiera las lee,
-- escribe y borra. Nadie las usa así: la plataforma las toca solo con la llave del servidor (que salta las reglas por fila),
-- ningún flujo de n8n las nombra y su último dato es del 14-abr.
-- Tras esto: seguridad por fila encendida y SIN reglas → solo el servidor. No toca filas. Reversa en supabase/reversas/.
begin;
drop policy "Admin full access pipeline_executions" on public.pipeline_executions;
drop policy "Admin full access pipeline_steps" on public.pipeline_steps;
revoke all on public.pipeline_executions from public, anon, authenticated;
revoke all on public.pipeline_steps from public, anon, authenticated;
commit;
