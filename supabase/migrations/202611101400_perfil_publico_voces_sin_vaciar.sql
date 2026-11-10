-- PERFIL DEL PÚBLICO · cierra un hueco medido al aplicar 202611101300 (10-nov 12:55Z): los privilegios POR OMISIÓN del esquema dieron a
-- anon y authenticated (y a service_role) TRUNCATE, TRIGGER y REFERENCES sobre perfil_publico_voces. TRUNCATE salta la seguridad por fila
-- y vaciaría la tabla de un golpe. Regla de la tabla: el servidor solo lee e inserta; nadie más la toca.
begin;
revoke all on public.perfil_publico_voces from anon, authenticated;
revoke truncate, trigger, references, update, delete on public.perfil_publico_voces from service_role;
grant select, insert on public.perfil_publico_voces to service_role;
commit;
