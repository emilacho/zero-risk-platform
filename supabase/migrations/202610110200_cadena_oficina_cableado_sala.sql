-- r63 (CC#1 2026-10-11) · relevo 61 · CABLEADO EN PASARELA de la sala a las dos puertas (cadena y oficina). Las filas acompañan al mapa (`journey-workflow-map.ts`): BRIEF → puerta de la cadena, PIEZAS → puerta de la oficina.
-- NO enciende nada: `cadena_config.estado_cadena` y `oficina_config.estado` siguen `apagada`; con ellas apagadas cada puerta REENVÍA el cuerpo intacto a lo de siempre (parte original · pieza simple).
-- Se aplica con 0 corridas vivas, DESPUÉS de activar las dos puertas en n8n (sin puerta activa el sobre no tendría quién lo reciba) y de publicar el mapa.
-- Reversa (cada línea se revierte sola):
--   (I2)  UPDATE public.ingress_sources SET active = false WHERE source = 'cadena/vigia';          -- no se borra: hay llave foránea
--   (I3a) UPDATE public.routing_rules SET active = false WHERE source = 'cadena/vigia' AND intent = 'briefear';
--   (I3b) UPDATE public.routing_rules SET worker_workflow_id = 'PQdIgbuFexuBsoh8' WHERE source = 'planeacion/plan-listo' AND intent = 'briefear';
--   (O3)  UPDATE public.routing_rules SET worker_workflow_id = 'lVCLzxQCKNkd3uS0' WHERE source = 'brief/parte-listo' AND intent = 'producir';

-- I2 · la fuente que usará el vigía de la cadena para pedir el paso siguiente (inerte hasta que alguien emita ese sobre)
INSERT INTO public.ingress_sources (source, tier, auth_method, auth_secret_env_var, intents_allowed, description, active)
VALUES ('cadena/vigia', 'A', 'internal_key', NULL, ARRAY['briefear'], 'r63 · la cadena pide el parte de trabajo de un lote · el sobre lo deja el vigía, la sala despacha BRIEF (la puerta de la cadena) · inerte con la cadena apagada', true)
ON CONFLICT (source) DO NOTHING;

-- I3a · su regla de ruteo (la copia que MANDA es JOURNEY_WORKFLOW_MAP.BRIEF)
INSERT INTO public.routing_rules (source, intent, journey_type, worker_workflow_id, active, priority, description)
SELECT 'cadena/vigia', 'briefear', 'BRIEF', 'pBAp5Cx7R39U585i', true, 100, 'r63 · la copia que MANDA es JOURNEY_WORKFLOW_MAP.BRIEF (journey-workflow-map.ts) · destino = la puerta de la cadena'
WHERE NOT EXISTS (SELECT 1 FROM public.routing_rules WHERE source = 'cadena/vigia' AND intent = 'briefear');

-- I3b · la regla vieja de planeación apunta a la puerta (mapa y regla no discrepan: el consumidor marcaría drift)
UPDATE public.routing_rules
   SET worker_workflow_id = 'pBAp5Cx7R39U585i',
       description = 'r63 · la copia que MANDA es JOURNEY_WORKFLOW_MAP.BRIEF (journey-workflow-map.ts) · destino = la puerta de la cadena (con la cadena apagada reenvía a la parte original) · PRODUCE sigue siendo planeación',
       updated_at = now()
 WHERE source = 'planeacion/plan-listo' AND intent = 'briefear' AND worker_workflow_id = 'PQdIgbuFexuBsoh8';

-- O3 · la regla de PIEZAS apunta a la puerta de la oficina
UPDATE public.routing_rules
   SET worker_workflow_id = 'PzZ3b6cY6DYmIaOQ',
       description = 'r63 · la copia que MANDA es JOURNEY_WORKFLOW_MAP.PIEZAS (journey-workflow-map.ts) · destino = la puerta de la oficina (sin familia o con la oficina apagada reenvía a la pieza simple) · PRODUCE sigue siendo planeación',
       updated_at = now()
 WHERE source = 'brief/parte-listo' AND intent = 'producir' AND worker_workflow_id = 'lVCLzxQCKNkd3uS0';
