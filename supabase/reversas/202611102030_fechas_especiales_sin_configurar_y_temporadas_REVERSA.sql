-- REVERSA de 202611102030_fechas_especiales_sin_configurar_y_temporadas.sql · deja las tablas como estaban medidas el 10-nov.
-- Lo que se escribió con el código nuevo vuelve a su forma vieja:
--   · una cobertura `sin_configurar` pasa a `sin_fuente` con 0 intentos (lo que significaba antes «sin dominios»);
--   · las temporadas de cliente (origen 'cliente') se borran: antes no existían y la tabla vieja no puede guardarlas sin pisar fechas públicas.

BEGIN;

UPDATE public.cadena_fechas_cobertura SET estado = 'sin_fuente', intentos = 0 WHERE estado = 'sin_configurar';
ALTER TABLE public.cadena_fechas_cobertura DROP CONSTRAINT cadena_cobertura_estado_valido;
ALTER TABLE public.cadena_fechas_cobertura ADD CONSTRAINT cadena_cobertura_estado_valido CHECK (estado IN ('verificada','sin_fuente','en_curso'));

DROP TABLE public.cadena_fechas_alarmas;

DELETE FROM public.cadena_fechas_especiales WHERE origen = 'cliente';
DROP INDEX public.cadena_fechas_unica;
ALTER TABLE public.cadena_fechas_especiales DROP CONSTRAINT cadena_fechas_tramo_valido;
ALTER TABLE public.cadena_fechas_especiales DROP CONSTRAINT cadena_fechas_cliente_segun_origen;
ALTER TABLE public.cadena_fechas_especiales DROP CONSTRAINT cadena_fechas_origen_valido;
ALTER TABLE public.cadena_fechas_especiales DROP COLUMN client_key;
ALTER TABLE public.cadena_fechas_especiales DROP COLUMN origen;
ALTER TABLE public.cadena_fechas_especiales DROP COLUMN hasta;
ALTER TABLE public.cadena_fechas_especiales DROP COLUMN client_id;
CREATE UNIQUE INDEX cadena_fechas_unica ON public.cadena_fechas_especiales (pais, tipo, ambito, fecha);

COMMIT;
