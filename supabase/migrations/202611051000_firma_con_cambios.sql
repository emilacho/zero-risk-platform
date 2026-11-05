-- FIRMAR CON CIFRAS CAMBIADAS · CC3 · 2026-11-05 · PROPUESTA: se aplica tras certificar, antes de publicar el código (la lista de decisiones la pide).
-- Aditiva: columna nueva y nula. Nadie la lee hasta publicar. Guarda propuesto, firmado, quién y cuándo; lleva siempre `meta_por_semana` (la corrida siguiente la usa como meta fijada por el dueño).
-- REVERSA: `supabase/reversas/202611051000_firma_con_cambios_REVERSA.sql`
ALTER TABLE public.finanzas_tableros ADD COLUMN IF NOT EXISTS firma_con_cambios jsonb;
COMMENT ON COLUMN public.finanzas_tableros.firma_con_cambios IS '{ de_tablero, de_version, cambios: [{clave, propuesto, firmado}], meta_por_semana, total_mes, propuesto: {meta_por_semana, total_mes}, por, en }. Null = firmado tal cual.';
CREATE INDEX IF NOT EXISTS finanzas_tableros_con_cambios ON public.finanzas_tableros (client_id, firmado_en DESC) WHERE firma_con_cambios IS NOT NULL;
