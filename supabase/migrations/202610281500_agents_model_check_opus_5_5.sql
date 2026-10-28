-- Ensancha `agents_model_check` para admitir `claude-opus-5-5` · CC#2 · 2026-10-28 · GO-LENOVO-director-creativo-y-modelo punto 2.
-- Para que el director creativo de la mesa pueda pasar a Opus 5.5. SOLO AMPLÍA la lista: los 8 ids vivos (leídos del catálogo en vivo el 28-oct, incluido `claude-sonnet-5-5`) siguen valiendo, más uno.
-- Una sola transacción: no hay instante sin restricción. NO cambia la fila de ningún agente (el cambio de modelo es un paso aparte).
BEGIN;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_model_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_model_check
  CHECK (model = ANY (ARRAY[
    'claude-haiku'::text,
    'claude-sonnet'::text,
    'claude-opus'::text,
    'claude-haiku-4-5-20251001'::text,
    'claude-sonnet-4-6'::text,
    'claude-opus-4-6'::text,
    'claude-opus-4-7'::text,
    'claude-sonnet-5-5'::text,
    'claude-opus-5-5'::text
  ]));
COMMIT;
NOTIFY pgrst, 'reload schema';
