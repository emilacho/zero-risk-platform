-- 01-nov · FIRMA de Emilio 08:42Z «sí a todo» punto 3 · `campaign-brief-agent`: «Briefs in English for internal use» → idioma y trato del manual del cliente · CC#1 · US$ 0.
--   Protocolo identity_content (2026-05-16): escritura documentada por migración + PR; se cambia UNA frase de la sección «Output Instructions» y NADA más de la identidad.
--   GUARDA: el UPDATE solo pega si el texto vivo es el leído el 2026-11-01 (md5 d546e93e6299aadb7651643e5348f95e · 2684 caracteres · sin CR); después debe medir
--   md5 1d80697d2016da0993495b51a2458a80 (2885 caracteres). Repetirla con el texto nuevo ya puesto no cambia nada (idempotente); con otro texto, se niega.
--   Ground truth: `src/agents/identities/` no tiene archivo para este agente (la fila nació del sync canónico); el respaldo de la frase vieja es la REVERSA.
--   Reversa: supabase/reversas/202611011510_agents_campaign_brief_agent_idioma_del_manual_REVERSA.sql
BEGIN;

UPDATE public.agents
   SET identity_content = replace(identity_content,
         'Briefs in English for internal use.',
         'Briefs in the language and with the form of address (tú, vos, usted or other) that the client''s brand manual sets; if the manual does not set them, use the official language of the client''s country and do not invent the form of address.'),
       updated_at = now()
 WHERE name = 'campaign-brief-agent'
   AND md5(identity_content) = 'd546e93e6299aadb7651643e5348f95e';

DO $$
DECLARE h text; n int;
BEGIN
  SELECT md5(identity_content), length(identity_content) INTO h, n FROM public.agents WHERE name = 'campaign-brief-agent';
  IF h IS NULL THEN RAISE EXCEPTION 'no existe la fila campaign-brief-agent'; END IF;
  IF h <> '1d80697d2016da0993495b51a2458a80' THEN RAISE EXCEPTION 'campaign-brief-agent no quedó con el texto esperado (md5 % · % caracteres): la identidad viva no es la leída el 01-nov, no se toca', h, n; END IF;
END $$;

COMMIT;
