-- 31-oct · OFICINA DE MARKETING · FIRMA de Emilio (20:01Z · `FIRMA-EMILIO-calendario-y-gancho`, punto 1) · CC#1 · PROPUESTA · NO APLICADA (se aplica en T9, publicación única)
--   El agente del calendario (`social-media-strategist`) pasa de haiku a sonnet. Es DATO (la fila de `agents`), no identidad: `identity_content` no se toca.
--   Nota: dentro de la cadena el modelo lo manda `cadena_config.modelo_cadena` (por omisión opus 5.5, `constantes.ts`), así que este cambio
--   vale para las demás puertas que invocan al agente sin `model_override` (p. ej. la planeación). Idempotente: solo cambia si sigue en haiku.
--   El valor `claude-sonnet` está en el CHECK `agents_model_check` (leído en producción 31-oct); `claude-sonnet-5-5` también, pero se deja el alias genérico como los 3 jefes.
-- Reversa: supabase/reversas/202610312005_agents_social_media_strategist_sonnet_REVERSA.sql
BEGIN;

UPDATE public.agents
   SET model = 'claude-sonnet'
 WHERE name = 'social-media-strategist'
   AND model = 'claude-haiku';

DO $$
DECLARE m text;
BEGIN
  SELECT model INTO m FROM public.agents WHERE name = 'social-media-strategist';
  IF m IS NULL THEN
    RAISE EXCEPTION 'no existe el agente social-media-strategist';
  END IF;
  IF m = 'claude-haiku' THEN
    RAISE EXCEPTION 'social-media-strategist sigue en haiku';
  END IF;
END $$;

COMMIT;
