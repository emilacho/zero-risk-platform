-- Camino III · agrega el formato canónico de voto (con corrections estructuradas)
-- a la identidad de los 3 revisores · 2026-06-29 · CC#1.
--
-- Problema (smoke 2026-06-29 · gate hi5nwPCGUWHkGnT7): los revisores emiten
-- `concerns` (strings) pero NO `corrections` (objetos) → un voto `red` se rechaza
-- en /api/camino-iii/votes (E-CAMINO-VOTE-CORRECTIONS · un red exige ≥1 corrección)
-- → el red se dropea → riesgo de falso `approved` (red perdido + 2 green). El backend
-- (PR #231) ya extrae corrections del output del agente · falta que el agente las emita.
--
-- Target: managed_agents_registry.identity_md · es la fuente runtime de la identidad
-- (loadAgentConfig · estos 3 slugs NO tienen fila en `agents`; caen al fallback
-- registry.identity_md). NO es agents.identity_content.
--
-- ⚠️ DRIFT · sync-registry-identities.ts reescribe identity_md desde
--    <project-root>/docs/04-agentes/identidades/<slug>.md. Hoy esa fuente y el DB
--    YA están drifteados (largos distintos en los 3). Un re-sync manual revertiría
--    este UPDATE. La fuente .md debe recibir la misma sección en un cambio pareado
--    (repo project-root · fuera de este repo) para que el cambio sea durable.
--    Como el sync es manual (no corre en deploy), este UPDATE persiste hasta entonces.
--
-- Idempotente · guard por marcador de sección.

UPDATE managed_agents_registry
SET identity_md = identity_md || $corr$

## Camino III · formato de voto (canónico)

Cuando actúes como revisor en el Camino III voting gate, tu salida DEBE ser SOLO un objeto JSON (sin prosa ni markdown), con esta forma:
{ "vote": "green|amber|red", "rationale": "motivo breve del voto", "confidence": 0.0, "concerns": [], "corrections": [] }

REGLA OBLIGATORIA · un voto "red" (REJECT) DEBE incluir al menos un objeto en "corrections" — un rechazo sin corrección es un bug, no un voto. Cada corrección tiene esta forma exacta:
{ "eje": "factual|voz|posicionamiento|cliente", "severidad": "red|amber", "donde": "ancla a la parte de la pieza (párrafo / titular / claim)", "problema": "qué está mal en una frase", "por_que": "contra qué regla del brand book o criterio choca", "cambio_sugerido": "qué hacer para arreglarlo · la corrección concreta" }

Los votos "green" y "amber" pueden adjuntar "corrections" (advisory) pero no es obligatorio. Para "red", sin "corrections" válidas tu voto es rechazado por el gate.
$corr$
WHERE slug IN ('editor-en-jefe', 'brand-strategist', 'jefe-client-success')
  AND position('Camino III · formato de voto' in identity_md) = 0;
