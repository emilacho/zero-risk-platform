-- REVERSA de 202611011510 · vuelve la frase vieja de `campaign-brief-agent` («Briefs in English for internal use.») · solo si el texto vivo es el que dejó la migración (md5).
BEGIN;
UPDATE public.agents
   SET identity_content = replace(identity_content,
         'Briefs in the language and with the form of address (tú, vos, usted or other) that the client''s brand manual sets; if the manual does not set them, use the official language of the client''s country and do not invent the form of address.',
         'Briefs in English for internal use.'),
       updated_at = now()
 WHERE name = 'campaign-brief-agent'
   AND md5(identity_content) = '1d80697d2016da0993495b51a2458a80';
DO $$
DECLARE h text;
BEGIN
  SELECT md5(identity_content) INTO h FROM public.agents WHERE name = 'campaign-brief-agent';
  IF h <> 'd546e93e6299aadb7651643e5348f95e' THEN RAISE EXCEPTION 'la reversa no dejó el texto del 01-nov (md5 %)', h; END IF;
END $$;
COMMIT;
