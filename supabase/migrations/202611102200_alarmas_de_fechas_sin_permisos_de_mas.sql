-- GO-LENOVO 10-nov 18:14Z punto 1 (hallazgo CC3 en #1002, confirmado por CC6): la tabla de alarmas de fechas nació con permisos de más para el servidor,
-- heredados de los valores por omisión de `public` (el REVOKE ALL de 202611102030 no tocaba a service_role).
-- Medido en vivo 10-nov 18:07Z: cadena_fechas_alarmas service_role=arwDxtm · cadena_fechas_alarmas_id_seq service_role=rwU.
-- Queda lo que la migración pidió: SELECT, INSERT y UPDATE en la tabla (UPDATE = cerrar la alarma), USAGE y SELECT en el contador (USAGE basta para nextval).
-- Se quitan vaciar (TRUNCATE), referencias, disparadores y mantenimiento en la tabla, y UPDATE (setval) en el contador. DELETE ya no estaba.
-- Reversa exacta: supabase/reversas/202611102200_alarmas_de_fechas_sin_permisos_de_mas_REVERSA.sql
begin;
revoke truncate, references, trigger, maintain on public.cadena_fechas_alarmas from service_role;
revoke update on sequence public.cadena_fechas_alarmas_id_seq from service_role;
commit;
