-- REVERSA de 202610312008 · quita las seis tarjetas, devuelve design-visual-storyteller a `kit` + `concepto` y quita la columna `indicacion`.
-- Se niega si algún encargo de la oficina sigue abierto (el directorio de una pieza abierta está congelado en su estado: no se le quita nada a media pieza).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN RAISE EXCEPTION 'hay encargos de la oficina en curso: no se toca el directorio'; END IF;
END $$;
DELETE FROM public.oficina_directorio WHERE agente IN ('whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist', 'market_research_analyst', 'video-editor', 'marketing_video_optimization_specialist');
UPDATE public.oficina_directorio SET pertinente_en = array_remove(array_remove(pertinente_en, 'carrusel'), 'video'), actualizado_en = now() WHERE agente = 'design-visual-storyteller';
ALTER TABLE public.oficina_directorio DROP COLUMN IF EXISTS indicacion;
COMMIT;
NOTIFY pgrst, 'reload schema';
