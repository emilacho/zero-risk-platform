-- REVERSA de 202611172110_oficina_directorio_critica_en_la_gran_idea.sql · quita SOLO `concepto:critica` de `social-media-strategist`; la crítica en las piezas sigue.
--   No toca el tope de `concepto_mesa` (eso es de CC1 y tiene su propia reversa).
BEGIN;

UPDATE public.oficina_directorio
   SET pertinente_en = array_remove(pertinente_en, 'concepto:critica'),
       version = version + 1,
       actualizado_en = now()
 WHERE agente = 'social-media-strategist'
   AND 'concepto:critica' = ANY(pertinente_en);

DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.oficina_directorio WHERE activo AND 'concepto:critica' = ANY(pertinente_en);
  IF c <> 0 THEN RAISE EXCEPTION 'quedó una tarjeta activa con concepto:critica (filas: %)', c; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
