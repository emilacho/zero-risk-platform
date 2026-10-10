-- OJO: esta reversa también borra cadena_config (interruptor, clientes de ensayo, flujos, puerta_workflow_id y latido del vigía). Al volver atrás se pierde esa semilla: re-aplicar la migración y el SQL de cadena_config.
-- REVERSA de las tablas de la cadena (PR 1) · CC#1 · 2026-10-09 · deja el esquema IDÉNTICO a antes.
-- 🔴 SE NIEGA A BORRAR DATOS: si alguna tabla de trabajo (campañas, estrategias, filas, validaciones, esperas, corridas, fechas) tiene filas, ABORTA con error y no borra nada. Primero EXPORTAR.
--    Las tres tablas de datos de ajuste (config, plazos, formatos) se borran con sus semillas; si alguien AÑADIÓ filas fuera de la siembra, también aborta.
-- 🔴 NO va en `supabase/migrations/`: vive en `supabase/reversas/`.
-- Orden: primero las que apuntan a campañas, luego campañas, luego las de ajuste. Una sola transacción.
BEGIN;
DO $guarda$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['cadena_corridas','cadena_esperas','cadena_validaciones','cadena_calendario_filas','cadena_estrategias','cadena_campanas','cadena_fechas_especiales','cadena_fechas_cobertura'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % tiene % filas. Exportar antes de borrar.', t, n; END IF;
    END IF;
  END LOOP;
  IF to_regclass('public.cadena_plazos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cadena_plazos WHERE tipo <> ALL (ARRAY[''dato_en_investigacion'',''espera_video'',''aprobacion_bandeja'',''necesita_humano'',''campana_pausada'',''fecha_inicio_propuesta'',''llamada_agente'',''vigia_latido''])' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: cadena_plazos tiene % tipos añadidos después de la migración. Exportar antes de borrar.', n; END IF;
  END IF;
  IF to_regclass('public.cadena_formatos_por_red') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cadena_formatos_por_red' INTO n;
    IF n <> 19 THEN RAISE EXCEPTION 'REVERSA ABORTADA: cadena_formatos_por_red tiene % filas y la siembra son 19 (alguien las cambió). Exportar antes de borrar.', n; END IF;
  END IF;
END
$guarda$;
DROP TABLE IF EXISTS public.cadena_corridas;
DROP TABLE IF EXISTS public.cadena_esperas;
DROP TABLE IF EXISTS public.cadena_validaciones;
DROP TABLE IF EXISTS public.cadena_calendario_filas;
DROP TABLE IF EXISTS public.cadena_estrategias;
DROP TABLE IF EXISTS public.cadena_campanas;
DROP TABLE IF EXISTS public.cadena_fechas_especiales;
DROP TABLE IF EXISTS public.cadena_fechas_cobertura;
DROP TABLE IF EXISTS public.cadena_plazos;
DROP TABLE IF EXISTS public.cadena_formatos_por_red;
DROP TABLE IF EXISTS public.cadena_config;
COMMIT;
NOTIFY pgrst, 'reload schema';
