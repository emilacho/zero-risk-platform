-- REVERSA de 202610100900_cerebro_diario.sql · quita las 4 tablas NUEVAS del portero diario · deja el esquema IDÉNTICO a antes.
-- 🔴 SE NIEGA A BORRAR DATOS (convención de la cadena y de la oficina): si alguna de las 4 tablas tiene filas, ABORTA con error y no borra nada. Primero EXPORTAR.
--    Aunque sean rastro y estado de vigilancia (no datos de origen), borrarlos tira el historial de versiones y el candado de «una corrida por día»: se decide a propósito, no por accidente.
-- 🔴 NO va en `supabase/migrations/`: vive en `supabase/reversas/`. Una sola transacción: o se borra todo o no se borra nada.
-- Orden: la guarda mira las 4 antes de borrar la primera.
BEGIN;
DO $guarda$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['cerebro_oportunidades','cerebro_avisos','cerebro_diario_corridas','cerebro_vigilancia'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % tiene % filas. Exportar antes de borrar.', t, n; END IF;
    END IF;
  END LOOP;
END
$guarda$;
DROP TABLE IF EXISTS public.cerebro_oportunidades;
DROP TABLE IF EXISTS public.cerebro_avisos;
DROP TABLE IF EXISTS public.cerebro_diario_corridas;
DROP TABLE IF EXISTS public.cerebro_vigilancia;
NOTIFY pgrst, 'reload schema';
COMMIT;
