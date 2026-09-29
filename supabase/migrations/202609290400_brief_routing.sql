-- EL SÉPTIMO TIPO DE VIAJE «BRIEF» · su fuente y su fila de ruteo · CC#1 · 2026-09-29 (encargo Lenovo §1.1 · firmado por Emilio).
-- 🔴 NO APLICADA al escribirse: se aplica en la PUBLICACIÓN, con aviso previo, junto con el flujo `zero-risk/brief`.
-- Es ADITIVA e inerte hasta que alguien emita un sobre `planeacion/plan-listo` (eso lo agrega CC#2 al final de planeación).
--
-- Dos filas, y las dos hacen falta (medido 29-sep):
--   1) `ingress_sources`: `routing_rules.source` tiene LLAVE FORÁNEA a `ingress_sources(source)`. La fuente
--      `planeacion/plan-listo` NO existía: sin esta fila, la de ruteo ni se puede insertar.
--   2) `routing_rules`: la terna (source · intent · journey_type). OJO: la columna se llama `journey_type`, NO `kind`.
--      Índice único parcial `(source, intent) WHERE active = true`: una sola regla activa por par.
INSERT INTO public.ingress_sources (source, tier, auth_method, auth_secret_env_var, intents_allowed, description, active)
VALUES (
  'planeacion/plan-listo', 'A', 'internal_key', NULL, ARRAY['briefear'],
  'CC#1 29-sep · planeación pide el paso siguiente al terminar · el sobre lo deja el obrero, la sala despacha BRIEF (parte de trabajo)',
  true
)
ON CONFLICT (source) DO NOTHING;

INSERT INTO public.routing_rules (source, intent, journey_type, worker_workflow_id, active, priority, description)
VALUES (
  'planeacion/plan-listo', 'briefear', 'BRIEF', 'PQdIgbuFexuBsoh8', true, 100,
  'CC#1 29-sep · séptimo tipo de viaje BRIEF · la copia que MANDA es JOURNEY_WORKFLOW_MAP.BRIEF (journey-workflow-map.ts) · PRODUCE sigue siendo planeación'
)
ON CONFLICT DO NOTHING;
