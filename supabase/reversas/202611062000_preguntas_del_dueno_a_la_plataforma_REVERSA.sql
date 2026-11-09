-- REVERSA de 202611062000_preguntas_del_dueno_a_la_plataforma.sql
-- Devuelve la escritura a `cerebro_dueno_preguntas` (quita el disparador y restaura los permisos de la migración 202610161500).
-- Las filas movidas a `dueno_preguntas` NO se borran aquí: la tabla vieja nunca perdió las suyas, y la nueva es de CC1 (su reversa decide).
-- Lo que la plataforma cambió en `dueno_preguntas` después de migrar (respuestas, asumidas, descartes) NO vuelve solo a la tabla vieja: si se corre esta reversa,
-- antes se compara una con otra por id (mismo id en las dos) y se copia a mano lo nuevo, con su fecha.
begin;
drop trigger if exists cerebro_dueno_preguntas_solo_lectura on public.cerebro_dueno_preguntas;
drop function if exists public.cerebro_dueno_preguntas_solo_lectura();
grant select, insert, update on public.cerebro_dueno_preguntas to service_role;
comment on table public.cerebro_dueno_preguntas is 'Preguntas que una oficina le hizo al dueño y esperan respuesta (para que otra oficina no repita la pregunta). Las respuestas son fichas del cerebro con origen dueno.';
commit;
