-- 202610312003 · cadena_brief_creativo.plazo_en · 31-oct (oficina de marketing · T3 · CC#1 · hueco 1 de CC3 «brief borrador huérfano, sin red de seguridad»)
-- La mesa del brief gana el mismo plazo propio que ya tiene la de concepto (plazo de trabajo + holgura): si la oficina nunca entrega (sobre que no llegó, flujo caído),
-- el reloj deja el brief `descartada` con motivo y la campaña reabre una vez; a la segunda, `necesita_humano` con alerta. Antes, un `borrador` sin encargo paraba la campaña para siempre.
-- Admite NULL: las filas de hoy no existen todavía (la palanca nace vacía). Reversa: supabase/reversas/202610312003_cadena_brief_creativo_plazo_REVERSA.sql
ALTER TABLE public.cadena_brief_creativo ADD COLUMN IF NOT EXISTS plazo_en timestamptz NULL;
COMMENT ON COLUMN public.cadena_brief_creativo.plazo_en IS 'red de seguridad de la mesa del brief (plazo de trabajo + holgura); pasado, el reloj la deja descartada y la campaña reabre una vez. 31-oct T3.';
