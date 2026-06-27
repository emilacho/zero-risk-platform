-- Camino III · lazo de corrección · schema additivo (SPEC 2026-06-27 · §144).
--
-- Construye el soporte de datos para el lazo `REJECT + correcciones → el
-- creador corrige → re-vota` (auditoría hueco #5 · un rechazo era terminal).
--
-- Additivo · NO crea tablas nuevas (las 3 ya existen en prod · PR #189) ·
-- solo agrega columnas + un valor de enum + un índice de idempotencia.
--
-- Migration SINGLE-FILE per R10. Aplicar (§144 paso separado) ·
--   psql ... < 202606271200_camino_iii_correction_loop.sql
-- NO `db push` (drift). §148 honest · NO aplicada en este PR · el código
-- degrada fail-open hasta el apply (escribe a columnas inexistentes → error
-- tagged · nunca crashea).
--
-- ⚠️ ALTER TYPE ADD VALUE va PRIMERO + fuera de transacción (Postgres no deja
-- usar un valor de enum recién creado en la misma transacción). Las columnas
-- van después.

-- ─── 1 · nuevo event type · correction_required ─────────────────────
-- Naming · SPEC §5 lo llama logical "camino_iii.rejected_with_corrections" ·
-- el ENUM usa snake_case de un token (convención existente · gate_resolved,
-- dead_letter) → valor canónico = 'correction_required'. El nombre dotted
-- del spec vive como operation_type/label del payload, NO como enum value.
ALTER TYPE sala_event_type_enum ADD VALUE IF NOT EXISTS 'correction_required';

-- ─── 2 · editorial_decisions · paquete de correcciones + contador ───
-- corrections · paquete consolidado (1 array de objetos-corrección de todos
--   los revisores · fuente de verdad que el creador lee por item_id).
-- revision_count · ciclos de corrección · empieza 0 · tope §150 = 3 → ESCALATE.
ALTER TABLE editorial_decisions
  ADD COLUMN IF NOT EXISTS corrections JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE editorial_decisions
  ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0
    CHECK (revision_count >= 0);

-- Idempotencia del lazo (§150) · 1 expediente por pieza (item_type+item_id).
-- Un doble-disparo NO abre dos lazos. UNIQUE(review_id) ya existe (por ciclo) ·
-- este es el ancla a nivel pieza por el que el worker recupera correcciones.
CREATE UNIQUE INDEX IF NOT EXISTS uq_editorial_decisions_item
  ON editorial_decisions (item_type, item_id);

CREATE INDEX IF NOT EXISTS idx_editorial_revision_count
  ON editorial_decisions (revision_count) WHERE revision_count > 0;

-- ─── 3 · camino_iii_votes · objetos-corrección accionables por revisor ─
-- corrections · array de objetos {eje,severidad,donde,problema,por_que,
--   cambio_sugerido} (SPEC §2). `concerns` (preexistente · vaguedades) se
--   conserva backward-compat · `corrections` es lo accionable estructurado.
--   La fila de GPT-5.5 (is_voting=false · preexistente) también las lleva.
ALTER TABLE camino_iii_votes
  ADD COLUMN IF NOT EXISTS corrections JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─── POST-CHECK ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='editorial_decisions' AND column_name='revision_count'
  ) THEN
    RAISE EXCEPTION 'POST-CHECK FAILED · editorial_decisions.revision_count missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='camino_iii_votes' AND column_name='corrections'
  ) THEN
    RAISE EXCEPTION 'POST-CHECK FAILED · camino_iii_votes.corrections missing';
  END IF;
  RAISE NOTICE 'camino_iii correction loop schema · verified';
END $$;
