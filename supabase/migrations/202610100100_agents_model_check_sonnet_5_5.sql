-- Ensancha `agents_model_check` para admitir `claude-sonnet-5-5` · CC#2 · 2026-10-10 · SIN APLICAR (pide firma).
-- Hallazgo de la certificación del #456: sin esto, `UPDATE agents SET model = 'claude-sonnet-5-5'` falla con 23514.
-- SOLO AMPLÍA la lista: los 7 ids actuales (leídos del catálogo en vivo el 09-oct) siguen valiendo, más uno. Ninguna fila existente puede romperse.
-- Una sola transacción: no hay instante sin restricción. NO cambia la fila de ningún agente (eso es un paso aparte).
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
    'claude-sonnet-5-5'::text
  ]));
COMMIT;
NOTIFY pgrst, 'reload schema';
