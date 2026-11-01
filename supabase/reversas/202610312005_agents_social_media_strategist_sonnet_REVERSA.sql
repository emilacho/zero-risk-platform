-- REVERSA de 202610312005_agents_social_media_strategist_sonnet.sql · devuelve el agente del calendario a haiku (su valor del 31-oct antes de la firma)
BEGIN;

UPDATE public.agents
   SET model = 'claude-haiku'
 WHERE name = 'social-media-strategist'
   AND model = 'claude-sonnet';

COMMIT;
