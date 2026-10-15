-- REVERSA de 202610151500_cerebro_alcance_de_la_ficha.sql · quita la columna `alcance` de `cerebro_fichas`.
-- 🔴 SE NIEGA A BORRAR DATOS: aborta si alguna ficha tiene `alcance`. Primero EXPORTAR (o retirar esas fichas).
-- 🔴 NO va en `supabase/migrations/`. Una sola transacción.
BEGIN;
DO $guarda$
DECLARE n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cerebro_fichas' AND column_name='alcance') THEN
    EXECUTE 'SELECT count(*) FROM public.cerebro_fichas WHERE alcance IS NOT NULL' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % fichas usan `alcance`. Exportar antes de borrar.', n; END IF;
  END IF;
END
$guarda$;
DROP INDEX IF EXISTS public.cerebro_fichas_por_alcance;
ALTER TABLE public.cerebro_fichas DROP CONSTRAINT IF EXISTS cerebro_fichas_alcance_valido;
ALTER TABLE public.cerebro_fichas DROP COLUMN IF EXISTS alcance;
COMMIT;
NOTIFY pgrst, 'reload schema';
