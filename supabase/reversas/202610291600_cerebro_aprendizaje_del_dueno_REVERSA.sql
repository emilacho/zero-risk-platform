-- REVERSA de 202610291600 · se NIEGA si hay fichas de aprendizaje o medidas escritas (nada se borra con datos).
BEGIN;
DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cerebro_fichas WHERE clase = 'aprendizaje_del_dueno' OR alcance IN ('industria','formato','general')) THEN RAISE EXCEPTION 'hay fichas del aprendizaje del dueño: no se revierte'; END IF;
  IF EXISTS (SELECT 1 FROM public.cerebro_aprendizaje_medidas) THEN RAISE EXCEPTION 'hay medidas escritas: no se revierte'; END IF;
END
$r$;
DROP FUNCTION IF EXISTS public.buscar_aprendizaje_del_dueno(text[], vector, text, int);
DROP TABLE IF EXISTS public.cerebro_aprendizaje_indice;
DROP TABLE IF EXISTS public.cerebro_aprendizaje_catalogo;
DROP TABLE IF EXISTS public.cerebro_aprendizaje_medidas;
ALTER TABLE public.cerebro_fichas DROP CONSTRAINT IF EXISTS cerebro_fichas_alcance_valido;
ALTER TABLE public.cerebro_fichas ADD CONSTRAINT cerebro_fichas_alcance_valido CHECK (alcance IS NULL OR alcance IN ('cliente','competidor','mercado','zona'));
COMMIT;
NOTIFY pgrst, 'reload schema';
