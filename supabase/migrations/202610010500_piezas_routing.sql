-- EL OCTAVO TIPO DE VIAJE «PIEZAS» · su fuente y su fila de ruteo · CC#1 · 2026-10-01 (encargo Lenovo «construir el flujo de la pieza» · §144 Emilio 01-oct).
-- 🔴 NO APLICADA al escribirse: se aplica en la PUBLICACIÓN, con aviso previo, junto con la activación del flujo `zero-risk/pieza` (lVCLzxQCKNkd3uS0) y la fusión del código.
-- Es ADITIVA e inerte hasta que alguien emita un sobre `brief/parte-listo`.
--
-- Dos filas, y las dos hacen falta (medido 29-sep con BRIEF): `routing_rules.source` tiene LLAVE FORÁNEA a `ingress_sources(source)`: sin la fuente la regla ni se inserta.
-- La columna se llama `journey_type` (NO `kind`). Índice único parcial `(source, intent) WHERE active = true`: una sola regla activa por par.
-- El nombre `PIEZAS` evita la colisión con `PRODUCE` (que es planeación): una mayúscula de diferencia ya costó un sobre perdido en esta casa.
INSERT INTO public.ingress_sources (source, tier, auth_method, auth_secret_env_var, intents_allowed, description, active)
VALUES (
  'brief/parte-listo', 'A', 'internal_key', NULL, ARRAY['producir'],
  'CC#1 01-oct · pedir la pieza de UN brief de un parte · el sobre lo deja quien lo pida (el parte listo, la bandeja, un humano) · la sala despacha PIEZAS',
  true
)
ON CONFLICT (source) DO NOTHING;

INSERT INTO public.routing_rules (source, intent, journey_type, worker_workflow_id, active, priority, description)
VALUES (
  'brief/parte-listo', 'producir', 'PIEZAS', 'lVCLzxQCKNkd3uS0', true, 100,
  'CC#1 01-oct · octavo tipo de viaje PIEZAS · la copia que MANDA es JOURNEY_WORKFLOW_MAP.PIEZAS (journey-workflow-map.ts) · PRODUCE sigue siendo planeación'
)
ON CONFLICT DO NOTHING;
