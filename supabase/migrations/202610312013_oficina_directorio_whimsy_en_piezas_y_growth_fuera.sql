-- 01-nov · ORDEN de Lenovo PASO A (FIRMA de Emilio «hoja sin reja…» puntos 2, 5 y 6) · CC#2 · `oficina_directorio` es DATO.
--   2) Whimsy Injector entra a la mesa de piezas (carrusel y kit) SOLO cuando el manual, el brief o el plan lo ameritan: `carrusel:si_whimsy`, `kit:si_whimsy`
--      (la mesa calcula `si_whimsy` al abrir la pieza: palabras de tono lúdico afirmadas, no negadas · código `condicionesDeLaPieza`). En la gran idea sigue FIJO (`concepto`).
--   5) `carousel-designer` ya figura en la mesa de piezas (`carrusel` desde 202610281500): se comprueba, no se toca.
--   6) `growth-hacker` SALE de la mesa de creativos: si tuviera fila en el directorio se le quitan `concepto`, `carrusel` y `kit` y se desactiva; hoy no la tiene (no-op) y la migración lo dice. Pasa a la mesa de análisis (DISEÑO de CC#1).
--   Aditiva e idempotente. ORDEN: después de 202610312008 (la fila de whimsy-injector). NO APLICADA: se aplica en la publicación única (T9).
--   Reversa: supabase/reversas/202610312013_oficina_directorio_whimsy_en_piezas_y_growth_fuera_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'carrusel:si_whimsy'), actualizado_en = now()
  WHERE agente = 'whimsy-injector' AND NOT ('carrusel:si_whimsy' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'kit:si_whimsy'), actualizado_en = now()
  WHERE agente = 'whimsy-injector' AND NOT ('kit:si_whimsy' = ANY(pertinente_en));

UPDATE public.oficina_directorio SET activo = false, pertinente_en = ARRAY[]::text[], actualizado_en = now() WHERE agente = 'growth-hacker';

DO $$
DECLARE w int; c int; g int;
BEGIN
  SELECT count(*) INTO w FROM public.oficina_directorio WHERE agente = 'whimsy-injector' AND 'concepto' = ANY(pertinente_en) AND 'carrusel:si_whimsy' = ANY(pertinente_en) AND 'kit:si_whimsy' = ANY(pertinente_en);
  SELECT count(*) INTO c FROM public.oficina_directorio WHERE agente = 'carousel-designer' AND activo AND 'carrusel' = ANY(pertinente_en);
  SELECT count(*) INTO g FROM public.oficina_directorio WHERE agente = 'growth-hacker' AND (activo OR cardinality(pertinente_en) > 0);
  IF w <> 1 THEN RAISE EXCEPTION 'whimsy-injector debía quedar en el concepto y, con condición, en carrusel y kit (filas: %)', w; END IF;
  IF c <> 1 THEN RAISE EXCEPTION 'carousel-designer debía figurar en la mesa de piezas (filas: %)', c; END IF;
  IF g <> 0 THEN RAISE EXCEPTION 'growth-hacker no debe seguir en el directorio de la mesa de creativos (filas: %)', g; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
