-- REVERSA de 202611180020 · quita la tabla de las correcciones de la jefatura a la cadena.
-- Sin la tabla, la cadena sigue: leer = sin correcciones; la oficina conserva la devolución en el encargo (`jefatura.sentido.devoluciones`) como antes.
-- Se niega si hay correcciones en manos de un creador (una mesa a mitad no puede quedarse sin dónde dejar su respuesta).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.cadena_correcciones') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.cadena_correcciones WHERE estado = 'en_manos_del_creador') THEN
    RAISE EXCEPTION 'REVERSA 202611180020: hay correcciones en manos de un creador; esperar a que respondan';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.cadena_correcciones;

COMMIT;
