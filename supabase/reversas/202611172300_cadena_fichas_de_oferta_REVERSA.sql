-- REVERSA de 202611172300 · quita la tabla de las fichas de hechos por oferta Y la bolsa propia del lector (`cadena_campanas.presupuesto_lector_usd` + su CHECK).
-- Antes de correrla: sacar al lector de la puerta (restaurar `puerta-s4-fichas-ANTES.json`) y quitar su id de `cadena_config.flujos`.
-- Sin la tabla, la cadena sigue: el calendario no recibe ofertas y la hoja declara «sin fichas» (la lectura tolera la tabla ausente).
-- Sin la columna, el código lee la bolsa del lector como US$ 2 (`presupuestoDelLector`): tampoco rompe nada.
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
ALTER TABLE public.cadena_campanas DROP CONSTRAINT IF EXISTS cadena_campanas_presupuesto_lector_no_negativo;
ALTER TABLE public.cadena_campanas DROP COLUMN IF EXISTS presupuesto_lector_usd;

COMMIT;
