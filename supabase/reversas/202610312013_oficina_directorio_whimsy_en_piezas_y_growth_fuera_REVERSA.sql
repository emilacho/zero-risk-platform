-- REVERSA de 202610312013 · quita las dos condiciones de whimsy-injector en piezas. (growth-hacker no tenía fila: no hay nada que devolver.)
-- Se niega si algún encargo de la oficina sigue abierto (el directorio de una pieza abierta está congelado en su estado).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN RAISE EXCEPTION 'hay encargos de la oficina en curso: no se toca el directorio'; END IF;
END $$;
UPDATE public.oficina_directorio SET pertinente_en = array_remove(array_remove(pertinente_en, 'carrusel:si_whimsy'), 'kit:si_whimsy'), actualizado_en = now() WHERE agente = 'whimsy-injector';
COMMIT;
NOTIFY pgrst, 'reload schema';
