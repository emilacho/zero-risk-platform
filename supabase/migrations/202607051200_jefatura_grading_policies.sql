-- Migration · JEFATURA · registry de políticas de calificación · 2026-07-05
-- Sprint JEFATURA F0.2 · CC#2 · ADR-020 (La Jefatura = módulo general de calificación).
--
-- Registry DETERMINISTA (tabla, no código · espejo del routing_rules de la sala):
-- mapea `artifact_type → política`. Añadir un tipo nuevo (email · landing) =
-- UNA fila (ADR-020 §44), NO un workflow nuevo. Single-tenant canon · admin RLS.
--
-- §148 · MIGRACIÓN NO APLICADA A PROD · F0 = $0 (PR+doc). El apply es build post-GO
-- de Emilio (§144 · SPRINT-JEFATURA §84/§127).

BEGIN;

-- ─── jefatura_grading_policies · artifact_type → política ────────────────────
CREATE TABLE IF NOT EXISTS jefatura_grading_policies (
  artifact_type       TEXT PRIMARY KEY,
  artifact_class      TEXT NOT NULL
    CHECK (artifact_class IN ('cimiento', 'contenido')),
  -- CORRECCIÓN · siempre encendida (ADR-020 §36 · función base · todos los casos).
  correction_enabled  BOOLEAN NOT NULL DEFAULT true,
  -- JUICIO (gate) · SOLO contenido · el cimiento NUNCA se vota (no-circularidad §4).
  judgment_enabled    BOOLEAN NOT NULL DEFAULT false,
  -- Grader que decide canon · 'fidelity' (cimiento) | 'vote_3_of_n' (contenido).
  canon_grader        TEXT NOT NULL
    CHECK (canon_grader IN ('fidelity', 'vote_3_of_n')),
  -- Contrapeso cross-model · NO bloquea (ADR-020 §5 · §68) ·
  --   'shadow_scorer' (cimiento · dead-end F1.2) | 'gpt55_non_voting' (contenido · caza punto ciego F3.4).
  counterweight       TEXT
    CHECK (counterweight IN ('shadow_scorer', 'gpt55_non_voting')),
  -- Loop-cap CENTRAL (ADR-020 §7 · §121 · lección bb-worker degenerado · un solo lugar).
  max_cycles          INTEGER NOT NULL DEFAULT 1
    CHECK (max_cycles BETWEEN 1 AND 3),
  -- Umbral de fidelidad · SOLO cimiento (groundedness ≥0.85 factual) · NULL en contenido.
  fidelity_threshold  NUMERIC(3,2)
    CHECK (fidelity_threshold IS NULL OR (fidelity_threshold > 0 AND fidelity_threshold <= 1)),
  -- Config de voto · SOLO contenido (expected_votes + reglas approve/reject) · NULL en cimiento.
  vote_config         JSONB,
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Invariante NO-CIRCULARIDAD (ADR-020 §4 · no-negociable) · el cimiento jamás gatea por voto.
  CONSTRAINT jefatura_no_circular_cimiento
    CHECK (NOT (artifact_class = 'cimiento' AND judgment_enabled = true)),
  -- Consistencia grader ↔ clase.
  CONSTRAINT jefatura_grader_class_match
    CHECK (
      (artifact_class = 'cimiento'  AND canon_grader = 'fidelity') OR
      (artifact_class = 'contenido' AND canon_grader = 'vote_3_of_n')
    )
);

CREATE INDEX IF NOT EXISTS idx_jefatura_policies_class  ON jefatura_grading_policies(artifact_class);
CREATE INDEX IF NOT EXISTS idx_jefatura_policies_active ON jefatura_grading_policies(is_active) WHERE is_active = true;

ALTER TABLE jefatura_grading_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY jefatura_policies_service_role_all ON jefatura_grading_policies
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY jefatura_policies_authenticated_read ON jefatura_grading_policies
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE jefatura_grading_policies IS
  'Sprint JEFATURA F0.2 · CC#2 · ADR-020 · registry determinista artifact_type→política · añadir tipo = una fila · single-tenant admin RLS';

-- ─── SEED · cimiento (fidelidad · sin voto) + contenido (voto 3-de-N) ────────
-- Idempotente · ON CONFLICT DO NOTHING (no pisa ajustes manuales posteriores del registry).
INSERT INTO jefatura_grading_policies
  (artifact_type, artifact_class, correction_enabled, judgment_enabled, canon_grader, counterweight, max_cycles, fidelity_threshold, vote_config, notes)
VALUES
  -- CIMIENTO · corrige (Lazo A cap=1) · NO vota · fidelidad ≥0.85 decide canon.
  ('brand_book',  'cimiento',  true, false, 'fidelity',    'shadow_scorer',    1, 0.85, NULL,
     'ADR-020 · cimiento · Lazo A cap=1 · fidelidad groundedness campos factuales'),
  ('icp',         'cimiento',  true, false, 'fidelity',    'shadow_scorer',    1, 0.85, NULL,
     'ADR-020 · cimiento'),
  ('competitive', 'cimiento',  true, false, 'fidelity',    'shadow_scorer',    1, 0.85, NULL,
     'ADR-020 · cimiento'),
  -- CONTENIDO · corrige · vota 3-de-N contra el brand book del CEREBRO · rechazo SIEMPRE con correcciones.
  ('ad_creative', 'contenido', true, true,  'vote_3_of_n', 'gpt55_non_voting', 1, NULL,
     '{"expected_votes": 3, "approve": ">=2 green AND 0 red", "reject": ">=2 red", "else": "hitl", "amber": "advisory", "red_requires_corrections": true}'::jsonb,
     'ADR-020 · contenido · voto vs brand book · rechazo SIEMPRE con correcciones'),
  ('copy',        'contenido', true, true,  'vote_3_of_n', 'gpt55_non_voting', 1, NULL,
     '{"expected_votes": 3, "approve": ">=2 green AND 0 red", "reject": ">=2 red", "else": "hitl", "amber": "advisory", "red_requires_corrections": true}'::jsonb,
     'ADR-020 · contenido'),
  ('email',       'contenido', true, true,  'vote_3_of_n', 'gpt55_non_voting', 1, NULL,
     '{"expected_votes": 3, "approve": ">=2 green AND 0 red", "reject": ">=2 red", "else": "hitl", "amber": "advisory", "red_requires_corrections": true}'::jsonb,
     'ADR-020 · contenido'),
  ('landing',     'contenido', true, true,  'vote_3_of_n', 'gpt55_non_voting', 1, NULL,
     '{"expected_votes": 3, "approve": ">=2 green AND 0 red", "reject": ">=2 red", "else": "hitl", "amber": "advisory", "red_requires_corrections": true}'::jsonb,
     'ADR-020 · contenido')
ON CONFLICT (artifact_type) DO NOTHING;

COMMIT;
