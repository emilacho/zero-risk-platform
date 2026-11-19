-- REVERSA de 202611190600 · CADENA · grupo C · las rondas de corrección · CC3
-- Se NIEGA si alguna fila quedó `descartada_por_bloqueo` (volver al CHECK viejo la dejaría inválida) o si hay rondas guardadas:
-- primero hay que decidir qué hacer con ellas (nunca se borran en silencio).
BEGIN;

DO $guarda$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cadena_calendario_filas WHERE estado = 'descartada_por_bloqueo') THEN
    RAISE EXCEPTION 'REVERSA 202611190600 · hay filas descartada_por_bloqueo: decidir su estado antes de volver al CHECK viejo';
  END IF;
  IF to_regclass('public.cadena_estrategia_rondas') IS NOT NULL AND EXISTS (SELECT 1 FROM public.cadena_estrategia_rondas) THEN
    RAISE EXCEPTION 'REVERSA 202611190600 · cadena_estrategia_rondas tiene filas: respaldarlas antes de borrar la tabla';
  END IF;
END
$guarda$;

DROP TABLE IF EXISTS public.cadena_estrategia_rondas;

ALTER TABLE public.cadena_calendario_filas DROP CONSTRAINT IF EXISTS cadena_filas_estado_valido;
ALTER TABLE public.cadena_calendario_filas ADD CONSTRAINT cadena_filas_estado_valido CHECK (estado IN (
  'esquema','propuesta','validada','en_investigacion','lista_para_brief','briefeada','en_oficina','aprobada','cancelada',
  'espera_video','vencida_sin_brazo','perdio_su_fecha','descartada_sin_fuente'));

COMMIT;

NOTIFY pgrst, 'reload schema';
