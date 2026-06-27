-- Sprint-brain §144 · FASE B (FUNDACIONAL · ADR-012) · provenance_tag
-- 2026-06-27 · CC#1 · branch/shadow · NO aplicar a prod sin §144 (R10 single-file)
-- Plan · 00-meta/opus-4-8-traspaso/SPRINT-brain-plan-2026-06-09.md
-- ADR · 00-meta/opus-4-8-traspaso/ADR-012-anti-injection-ingress.md §6.6
-- Arq · 00-meta/opus-4-8-traspaso/ARQUITECTURA-camino-iii-y-brain-2026-06-09.md §3
--
-- B1 · "La etiqueta" · reservar la columna AHORA (schema-shaping · ADR-012 §6.6.2
--      es explícito: NO post-hoc add). Toda tabla que persiste contenido externo
--      DEBE llevar `provenance_tag JSONB NOT NULL`. La columna es el cimiento de
--      las "dos puertas" (evidence vs canon · FASE C) y de la "regla de lectura"
--      (FASE D · decidir/publicar lee SOLO canon).
--
-- B2 · backfill · las filas existentes toman el default legacy canon. En
--      Postgres 11+ ADD COLUMN ... DEFAULT es metadata-only · las filas
--      existentes leen el default sin reescritura.
--
-- Shape canon (ADR-012 §6.6.1 + dimensión evidence|canon de la arquitectura) ·
--   {
--     "source":        "apify_scrape" | "tally_form" | "onboarding_discovery" | "legacy_pre_adr012" | ...,
--     "ingress_id":    "uuid v4"      (opcional · presente cuando viene de ingress)
--     "session_id":    "16-char hex"  (opcional)
--     "trust_level":   "untrusted" | "tenant_trusted" | "system_trusted" | "unknown",
--     "received_at":   "ISO 8601"     (opcional),
--     "ingress_route": "endpoint|workflow_id" (opcional),
--     "type":          "evidence" | "canon"   ← dimensión dos-puertas (FASE C/D)
--   }
--
-- Default backfill canon (ADR-012 §6.6.2 + plan B2) · contenido pre-tag = evidencia
-- no-aprobada · trust desconocido · NUNCA tratar como hecho del cliente.
--   {"source":"legacy_pre_adr012","trust_level":"unknown","type":"evidence"}
--
-- ⚠️ FASE C · los writers canónicos (/api/brain/ingest-source · portero de datos ·
-- write-back de Camino III) DEBEN setear provenance_tag explícito · NO dejar el
-- default legacy. El default es SOLO para backfill de lo pre-existente.
--
-- Idempotente · ADD COLUMN IF NOT EXISTS + CHECK con nombre estable.

BEGIN;

DO $$
DECLARE
  t text;
  legacy_default jsonb := '{"source":"legacy_pre_adr012","trust_level":"unknown","type":"evidence"}'::jsonb;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'client_brain_chunks',          -- superficie canónica de RAG (mandatorio · FASE D filtra acá)
    'client_brand_books',           -- estructuradas que persisten contenido externo (ADR-012 §6.6.2)
    'client_icp_documents',
    'client_voc_library',
    'client_competitive_landscape',
    'client_historical_outputs'
  ]
  LOOP
    -- B1 · agregar columna NOT NULL con default legacy (backfillea existentes · B2)
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS provenance_tag jsonb NOT NULL DEFAULT %L::jsonb',
      t, legacy_default
    );

    -- CHECK · type ∈ {evidence,canon} · trust_level ∈ enum canon (+ unknown backfill)
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_provenance_tag_chk');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (
         (provenance_tag->>''type'') IN (''evidence'',''canon'')
         AND (provenance_tag->>''trust_level'') IN (''untrusted'',''tenant_trusted'',''system_trusted'',''unknown'')
       )',
      t, t || '_provenance_tag_chk'
    );

    -- Índice parcial para la regla de lectura (FASE D · "decidir/publicar lee SOLO canon")
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I ((provenance_tag->>''type''))',
      'idx_' || t || '_prov_type', t
    );
  END LOOP;
END $$;

-- B2 · backfill explícito (redundante con el DEFAULT · garantiza filas viejas
-- sin tag · no-op si ya tienen el default). Solo client_brain_chunks tiene filas
-- hoy (277 · audit 2026-06-27).
UPDATE client_brain_chunks
SET provenance_tag = '{"source":"legacy_pre_adr012","trust_level":"unknown","type":"evidence"}'::jsonb
WHERE provenance_tag IS NULL
   OR provenance_tag = '{}'::jsonb;

COMMIT;
