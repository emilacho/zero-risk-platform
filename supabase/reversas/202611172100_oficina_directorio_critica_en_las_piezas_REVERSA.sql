-- REVERSA de 202611172100_oficina_directorio_critica_en_las_piezas.sql · deja `social-media-strategist` como estaba (fila viva leída el 17-nov):
--   activo=false, pertinente_en='{}', especialidad 'estrategia de redes sociales y calendario'. Si la 202611172110 (concepto) ya se aplicó, correr antes SU reversa.
--   Con la tarjeta apagada, la mesa vuelve a ser la de antes (sin crítico, `criticoDe` → null). Las mesas en vuelo siguen con el directorio que congelaron.
BEGIN;

UPDATE public.oficina_directorio
   SET activo = false,
       pertinente_en = '{}'::text[],
       especialidad = 'estrategia de redes sociales y calendario',
       version = version + 1,
       actualizado_en = now()
 WHERE agente = 'social-media-strategist'
   AND (activo IS DISTINCT FROM false OR pertinente_en IS DISTINCT FROM '{}'::text[]);

DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.oficina_directorio WHERE activo AND EXISTS (SELECT 1 FROM unnest(pertinente_en) p WHERE p LIKE '%:critica');
  IF c <> 0 THEN RAISE EXCEPTION 'quedó una tarjeta activa con marca de crítica (filas: %)', c; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
