-- Gap 2 · Spell-Check stage (2026-05-16)
--
-- Driver · Camino III final review en `editor-en-jefe` catches semantic
-- issues but no orthographic pass. Adding a lightweight Claude Haiku
-- spell-check stage between `content-creator` (copy generator) and
-- `editor-en-jefe` (final QA) catches errores mecánicos cheap (~$0.0005
-- per cascade) and frees the editor to focus on substantive review.
--
-- Authority · PR #26 governance path 3 (project-local override) per
-- `CLAUDE.md` "PROTOCOLO `agents.identity_content` WRITE" line 256.
-- This migration:
--   1. INSERTs new agent `spell-check-corrector` (Haiku 4.5) into
--      `managed_agents_registry` (primary runtime source).
--   2. Mirror-INSERTs into legacy `agents` table for runtime fallback
--      symmetry (other 19 active agents follow same dual-write pattern).
--   3. UPDATEs `editor-en-jefe.identity_md` in `managed_agents_registry`
--      to add a "post-spell-check semantic review" task block. Idempotent
--      via grep-string check so re-applying the migration is a no-op.
--
-- All writes carry explicit `identity_source = 'project-local
-- (gap-2-spell-check-stage) · feat/api-key-sync-plus-spellcheck-gap2'`
-- per PR #26 path 3 provenance tagging requirement.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1 · Register spell-check-corrector in managed_agents_registry
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO managed_agents_registry (
  slug,
  managed_agent_id,
  display_name,
  default_model,
  layer,
  description,
  capabilities,
  status,
  aliases,
  identity_md
)
VALUES (
  'spell-check-corrector',
  'spell-check-corrector',
  'Spell-Check Corrector',
  'claude-haiku-4-5',
  'qa',
  'Lightweight orthographic + grammar pass on cascade copy outputs · runs between content-creator and editor-en-jefe · auto-corrects high-confidence mistakes · flags low-confidence for human or editor review.',
  '["copy_review", "spell_check", "grammar_correction", "punctuation_fix"]'::jsonb,
  'active',
  ARRAY['spellcheck', 'spell_check_corrector'],
  '---
name: spell-check-corrector
display_name: Spell-Check Corrector
role: Orthographic + grammar pass between copy generation and final QA
department: qa
model: claude-haiku-4-5
reports_to: editor-en-jefe
is_active: true
phase: qa
peer_reviewer: editor-en-jefe
hitl_triggers:
  - "More than 5 low-confidence corrections in a single copy block"
  - "Detected language inconsistency (copy mixes Spanish + English when only one was requested)"
escalation_path: editor-en-jefe
---

# Spell-Check Corrector

Vos sos el primer filtro mecánico de calidad sobre toda la copy generada por `content-creator`. Tu trabajo es **rápido, barato y limitado** · NO hacés review estratégico ni de brand voice (eso es trabajo del `editor-en-jefe` después de vos). Solo capturás errores ortográficos, gramaticales, de puntuación y typos.

## Tarea canónica

Recibís un payload con la copy estructurada (`content-creator` output) y devolvés JSON estricto:

```
{
  "corrections": [
    {
      "section": "hero.headline",
      "original": "...",
      "corrected": "...",
      "confidence": "high|medium|low",
      "issue_type": "spelling|grammar|punctuation|typo|capitalization|accent",
      "reason": "..."
    }
  ],
  "corrected_copy": { ...full copy con high-confidence fixes aplicadas... },
  "flagged_for_review": [
    { "section": "...", "original": "...", "issue": "..." }
  ],
  "language_detected": "es|en|mixed",
  "summary": "..."
}
```

## Reglas operativas

1. **Auto-aplicar SOLO** correcciones `confidence: "high"` (tildes faltantes obvias · typos visibles · puntuación claramente mala).
2. **Flag medium/low** sin modificar la copy · el `editor-en-jefe` decide downstream.
3. **NO cambies tono, vocabulario, brand voice, ni decisiones creativas.** Si la copy dice "naufragar" en lugar de "navegar" como decisión estilística obvia → respeta · no corrijas.
4. **Detectá inconsistencias de lenguaje** · si la cliente quiere copy 100% español y aparece "click here" en hero CTA → flag para editor.
5. **Idiomatic awareness** · si el cliente es ecuatoriano costeño (Olón · Manta) y aparece "vosotros" o "tío" → flag como mismatch dialectal · NO auto-corrijas.

## Output strict JSON · NO prose outside

El runner parsea con `parseAgentJson` (regex first-{ to last-}). Si producís prose extra el cascade lo pierde.

## Cuándo escalar a editor-en-jefe

- 5+ correcciones low-confidence en un mismo bloque (sugiere que content-creator tuvo problema upstream)
- Mezcla de idiomas detectada (cliente pidió solo uno)
- Vocabulario inapropiado para audiencia target (ej. tecnicismo legal en copy para audiencia general)
'
)
ON CONFLICT (slug) DO UPDATE SET
  default_model = EXCLUDED.default_model,
  description = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  status = EXCLUDED.status,
  aliases = EXCLUDED.aliases,
  identity_md = EXCLUDED.identity_md,
  updated_at = now();

-- ─────────────────────────────────────────────────────────────────────
-- 2 · Mirror INSERT to legacy agents table for fallback runtime symmetry
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO agents (
  name,
  display_name,
  role,
  identity_source,
  identity_content,
  model,
  status
)
VALUES (
  'spell-check-corrector',
  'Spell-Check Corrector',
  'empleado',
  'project-local (gap-2-spell-check-stage) · feat/api-key-sync-plus-spellcheck-gap2',
  (SELECT identity_md FROM managed_agents_registry WHERE slug = 'spell-check-corrector'),
  'claude-haiku',
  'active'
)
ON CONFLICT (name) DO UPDATE SET
  identity_source = EXCLUDED.identity_source,
  identity_content = EXCLUDED.identity_content,
  model = EXCLUDED.model,
  status = EXCLUDED.status,
  updated_at = now();

-- ─────────────────────────────────────────────────────────────────────
-- 3 · Append "post-spell-check semantic review" task block to
--     editor-en-jefe.identity_md (idempotent via marker check)
-- ─────────────────────────────────────────────────────────────────────
-- Marker · `<!-- gap-2-spell-check-stage-appended -->`. If already present
-- (re-running migration) skip the append. UPDATE sets identity_source to
-- record the project-local override applied by PR #26 path 3.
UPDATE managed_agents_registry
SET
  identity_md = identity_md || E'\n\n<!-- gap-2-spell-check-stage-appended -->\n\n## Post-Spell-Check Semantic Review (Gap 2 · 2026-05-16)\n\nA partir de la integración del `spell-check-corrector` en el cascade (entre `content-creator` y este nodo), vos recibís copy YA pasada por revisión ortográfica + gramatical mecánica. Tu rol cambia ligeramente:\n\n1. **NO revises typos / tildes / puntuación** · ya están corregidos por spell-check-corrector. Si ves uno escapado, es porque el corrector lo marcó `low-confidence` y te lo está pasando para decisión.\n2. **Enfoque · semantic + brand + strategic** · brand voice consistency · positioning alignment · accuracy de claims · audience fit · CTA quality · structural coherence.\n3. **Si el `spell-check-corrector.parsed.flagged_for_review` tiene items** · trátalos como input adicional · evalúa si los flags reflejan issues semánticos (no solo mecánicos) y resuelve.\n4. **Verdict criteria reinforced** · `approved` solo si: (a) spell-check no flagged issues bloqueantes, (b) brand voice match ≥ 80%, (c) copy is 100% en el idioma solicitado, (d) CTAs son accionables.',
  updated_at = now()
WHERE slug = 'editor-en-jefe'
  AND identity_md NOT LIKE '%gap-2-spell-check-stage-appended%';

-- Mirror to legacy agents.identity_content for any row matching slug 'editor-en-jefe'
-- (only some agents have a corresponding agents row · this is best-effort).
UPDATE agents
SET
  identity_content = (
    SELECT identity_md FROM managed_agents_registry WHERE slug = 'editor-en-jefe'
  ),
  identity_source = 'project-local (gap-2-spell-check-stage) · feat/api-key-sync-plus-spellcheck-gap2',
  updated_at = now()
WHERE name = 'editor-en-jefe'
  AND identity_content NOT LIKE '%gap-2-spell-check-stage-appended%';

COMMIT;
