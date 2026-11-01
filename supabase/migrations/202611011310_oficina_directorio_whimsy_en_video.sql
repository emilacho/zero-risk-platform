-- 01-nov · T9 · Whimsy Injector también en la mesa de VIDEO (Lenovo, SEÑAL T9: «SÍ, misma condición que en la mesa de piezas; el video es parte de la mesa de piezas») · CC#2 · `oficina_directorio` es DATO.
--   `video:si_whimsy`: la mesa calcula `si_whimsy` al abrir cualquier pieza de calendario (carrusel, kit o video) con el mismo código (`condicionesDeLaPieza`: tono lúdico afirmado en el brief, el manual o el plan).
--   Aditiva e idempotente. ORDEN: después de 202610312013 (la fila de whimsy ya tiene sus condiciones de piezas) y de 202610312012 (la mesa de video). Sin whimsy-injector en el directorio falla visible.
--   Reversa: supabase/reversas/202611011310_oficina_directorio_whimsy_en_video_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'video:si_whimsy'), actualizado_en = now()
  WHERE agente = 'whimsy-injector' AND NOT ('video:si_whimsy' = ANY(pertinente_en));

DO $$
DECLARE w int;
BEGIN
  SELECT count(*) INTO w FROM public.oficina_directorio WHERE agente = 'whimsy-injector' AND 'concepto' = ANY(pertinente_en) AND 'carrusel:si_whimsy' = ANY(pertinente_en) AND 'kit:si_whimsy' = ANY(pertinente_en) AND 'video:si_whimsy' = ANY(pertinente_en);
  IF w <> 1 THEN RAISE EXCEPTION 'whimsy-injector debía quedar en concepto, carrusel, kit y video con su condición (filas: %)', w; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
