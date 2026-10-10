-- REVERSA de `agents_model_check` + `claude-sonnet-5-5` · CC#2 · 2026-10-10 · deja la restricción IDÉNTICA a antes (7 ids).
-- 🔴 SE NIEGA A ROMPER DATOS: si algún agente ya usa `claude-sonnet-5-5`, ABORTA y no toca nada. Primero devolver esa fila a un id de la lista.
-- 🔴 NO va en `supabase/migrations/` (una herramienta de migraciones la correría sola). Una sola transacción.
BEGIN;
DO $guarda$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.agents WHERE model = 'claude-sonnet-5-5';
  IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % agente(s) usan claude-sonnet-5-5. Devolverlos a otro modelo antes.', n; END IF;
END
$guarda$;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_model_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_model_check
  CHECK (model = ANY (ARRAY[
    'claude-haiku'::text,
    'claude-sonnet'::text,
    'claude-opus'::text,
    'claude-haiku-4-5-20251001'::text,
    'claude-sonnet-4-6'::text,
    'claude-opus-4-6'::text,
    'claude-opus-4-7'::text
  ]));
COMMIT;
NOTIFY pgrst, 'reload schema';
