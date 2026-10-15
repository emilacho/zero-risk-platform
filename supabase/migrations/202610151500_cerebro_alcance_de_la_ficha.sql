-- 202610151500 · EL ALCANCE DE LA FICHA (15-oct · nuevos brazos del cerebro) · ADITIVA, una columna anulable.
-- De QUIÉN es el dato: cliente · competidor · mercado · zona. Una cifra de un competidor NO es una cifra del cliente: sin esta columna, un lector no puede distinguirlas.
-- 🔴 Nada se borra ni cambia: las fichas existentes quedan con `alcance` nulo (= las de siempre). Solo la escriben los brazos nuevos, que están APAGADOS.
-- 🔴 IDEMPOTENTE. Una sola transacción. REVERSA: `supabase/reversas/202610151500_cerebro_alcance_de_la_ficha_REVERSA.sql` (se NIEGA a borrar si alguna ficha la usa).
BEGIN;

ALTER TABLE public.cerebro_fichas ADD COLUMN IF NOT EXISTS alcance text;

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cerebro_fichas'::regclass AND conname = 'cerebro_fichas_alcance_valido') THEN
    ALTER TABLE public.cerebro_fichas ADD CONSTRAINT cerebro_fichas_alcance_valido CHECK (alcance IS NULL OR alcance IN ('cliente','competidor','mercado','zona'));
  END IF;
END
$chk$;

CREATE INDEX IF NOT EXISTS cerebro_fichas_por_alcance ON public.cerebro_fichas (client_id, alcance) WHERE alcance IS NOT NULL AND retirada_en IS NULL;

COMMENT ON COLUMN public.cerebro_fichas.alcance IS 'De quién es el dato: cliente · competidor · mercado · zona (las de zona llevan client_id = zona:<país>). Nulo = ficha anterior a los brazos nuevos. Ver brazos/ en portero-alimenta.';

COMMIT;

-- 🔴 una columna nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
