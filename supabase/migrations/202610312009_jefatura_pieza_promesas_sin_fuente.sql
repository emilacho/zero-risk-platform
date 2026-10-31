-- 31-oct · T6 · E3 (firmada) · PROMESAS SIN FUENTE en la pieza · plan de construcción v3 (CC#2).
--   El revisor de fondo de la política `pieza` marca como ficha de gravedad «sugerencia» toda promesa que ningún documento respalde (precio, «el más…», «gratis», salud, origen).
--   NO frena: la pieza llega a la bandeja con la ficha señalada. Es DATO (la indicación de la política), no código: se apaga o se reescribe con un UPDATE.
--   Aditiva e idempotente: solo agrega la frase si aún no está. No fija idioma ni trato (los pone el manual).
--   ORDEN: después de 202610131000 (la política existe). NO APLICADA: se aplica en la publicación única (T9).
--   Reversa: supabase/reversas/202610312009_jefatura_pieza_promesas_sin_fuente_REVERSA.sql
BEGIN;

UPDATE public.jefatura_grading_policies
   SET indicacion_fondo = indicacion_fondo || ' ' || $e3$Promesas sin fuente: si la pieza promete un precio, un «el más…», algo «gratis», un efecto en la salud o un origen que ningún documento respalda, señálalo en una ficha de gravedad "sugerencia" (no frena la pieza: llega señalada a la bandeja) y di qué documento la respaldaría.$e3$
 WHERE artifact_type = 'pieza'
   AND indicacion_fondo IS NOT NULL
   AND indicacion_fondo NOT LIKE '%Promesas sin fuente:%';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.jefatura_grading_policies WHERE artifact_type = 'pieza' AND indicacion_fondo LIKE '%Promesas sin fuente:%';
  IF n <> 1 THEN RAISE EXCEPTION 'la política pieza debía quedar con la regla de promesas sin fuente y hay % filas', n; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
