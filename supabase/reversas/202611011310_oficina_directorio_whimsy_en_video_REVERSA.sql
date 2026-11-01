-- REVERSA de 202611011310 · quita `video:si_whimsy` de whimsy-injector. Se niega si algún encargo de la oficina sigue abierto (el directorio de una pieza abierta está congelado).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN RAISE EXCEPTION 'hay encargos de la oficina en curso: no se toca el directorio'; END IF;
END $$;
UPDATE public.oficina_directorio SET pertinente_en = array_remove(pertinente_en, 'video:si_whimsy'), actualizado_en = now() WHERE agente = 'whimsy-injector';
COMMIT;
NOTIFY pgrst, 'reload schema';
