-- REVERSA de 202610100900_cerebro_diario.sql · quita las 4 tablas NUEVAS (solo si están vacías o si se acepta perder su contenido: son rastro y estado de vigilancia, no datos de origen).
-- Antes de ejecutar: confirmar `select count(*)` de cada una. Nada más depende de ellas.
BEGIN;
DROP TABLE IF EXISTS public.cerebro_oportunidades;
DROP TABLE IF EXISTS public.cerebro_avisos;
DROP TABLE IF EXISTS public.cerebro_diario_corridas;
DROP TABLE IF EXISTS public.cerebro_vigilancia;
NOTIFY pgrst, 'reload schema';
COMMIT;
