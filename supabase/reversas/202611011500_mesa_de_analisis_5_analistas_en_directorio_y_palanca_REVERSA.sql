-- REVERSA de 202611011500 · saca a los 5 analistas de la mesa de análisis del directorio y borra la palanca (solo si sigue apagada: una palanca
-- encendida a mano es una decisión de Emilio y no se pisa). Se niega con encargos abiertos (mismo patrón que 202611011400).
BEGIN;
DO $$
DECLARE abiertos int;
BEGIN
  SELECT count(*) INTO abiertos FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso');
  IF abiertos > 0 THEN RAISE EXCEPTION 'hay % encargos abiertos o en paso: la reversa espera a que cierren', abiertos; END IF;
END $$;
DELETE FROM public.oficina_directorio
 WHERE agente IN ('market_research_analyst', 'competitive-intelligence-agent', 'feedback-synthesizer', 'x-twitter-intelligence-analyst', 'growth-hacker')
   AND equipo = 'estrategia' AND rol = 'miembro' AND pertinente_en = ARRAY['analisis']::text[];
DELETE FROM public.cadena_config WHERE clave = 'mesa_de_analisis' AND (valor ->> 'encendida') IS DISTINCT FROM 'true';
COMMIT;
NOTIFY pgrst, 'reload schema';
