-- REVERSA de 202611102200_alarmas_de_fechas_sin_permisos_de_mas.sql · vuelve a lo medido en vivo el 10-nov 18:07Z
-- (cadena_fechas_alarmas service_role=arwDxtm · cadena_fechas_alarmas_id_seq service_role=rwU).
begin;
grant truncate, references, trigger, maintain on public.cadena_fechas_alarmas to service_role;
grant update on sequence public.cadena_fechas_alarmas_id_seq to service_role;
commit;
