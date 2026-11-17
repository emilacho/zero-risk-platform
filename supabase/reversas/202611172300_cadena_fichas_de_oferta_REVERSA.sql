-- REVERSA de 202611172300 · quita la tabla de las fichas de hechos por oferta.
-- Antes de correrla: sacar al lector de la puerta (restaurar `puerta-s4-fichas-ANTES.json`) y quitar su id de `cadena_config.flujos`.
-- Sin la tabla, la cadena sigue: el calendario no recibe ofertas y la hoja declara «sin fichas» (la lectura tolera la tabla ausente).
-- Se niega si hay una corrida del lector en curso (una llamada a mitad no puede quedarse sin dónde guardar).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cadena_corridas c WHERE c.paso = 'fichas' AND c.estado = 'en_curso') THEN
    RAISE EXCEPTION 'REVERSA 202611172300: hay una corrida del lector de fichas en curso; esperar a que cierre o venza';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.cadena_fichas_de_oferta;

COMMIT;
