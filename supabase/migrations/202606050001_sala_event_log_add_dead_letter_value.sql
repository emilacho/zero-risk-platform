-- DLQ Option A · agrega 'dead_letter' al ENUM sala_event_type_enum
-- Sprint 12 Fase 0 · co-req #3 pre-flip escalón 5 · 2026-06-04
-- Spec · DLQ-confirmacion-pre-flip-2026-06-04.md §5 Option A
-- Audit · existing schema usa Postgres ENUM real (NO CHECK constraint)
-- confirmado via probe live · error retornó "invalid input value for
-- enum sala_event_type_enum".
--
-- Aplicación · SINGLE-FILE per R10 · NO `db push`. CC#1 aplica con
-- `cat 202606050001_sala_event_log_add_dead_letter_value.sql | supabase db query --linked`
-- o equivalente psql. NO incluida en `supabase db push` ejecuciones masivas.
--
-- ALTER TYPE ... ADD VALUE semantics ·
--   - Idempotente con IF NOT EXISTS (Postgres 9.6+)
--   - Atomic dentro de su propia sesión
--   - Postgres 12+ permite ejecutarlo dentro de transacción (Supabase >= 14 OK)
--   - Reversal NOT trivial · Postgres no soporta DROP VALUE FROM ENUM
--     nativamente · si necesitás revertir · ver §7 abajo (full enum
--     recreation · NO ejecutar sin §144 explícito · riesgo data-loss)
--
-- Reversibilidad · sin DROP VALUE nativo · el valor queda como "no usado"
-- si no se emite ningún `dead_letter` event. El código TS sigue funcionando
-- igual con o sin el value en la DB · solo las INSERTs de tipo 'dead_letter'
-- fallarían si el value no existe. Practical rollback · simplemente NO
-- emitir el value (apagar el `onFailure` handler en código).
--
-- =====================================================================

-- ─── PRE-CHECK · refuse to run if enum doesn't exist (catches drift) ─

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'sala_event_type_enum'
  ) THEN
    RAISE EXCEPTION
      'PRE-CHECK · sala_event_type_enum NOT FOUND · expected base migration #141 applied first';
  END IF;
  RAISE NOTICE 'PRE-CHECK · sala_event_type_enum present · proceeding';
END $$;

-- ─── ALTER · idempotent ADD VALUE ───────────────────────────────────

ALTER TYPE sala_event_type_enum
  ADD VALUE IF NOT EXISTS 'dead_letter';

-- ─── POST-CHECK · verify value present ──────────────────────────────

DO $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'sala_event_type_enum'::regtype
      AND enumlabel = 'dead_letter'
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION
      'POST-CHECK · ALTER TYPE ADD VALUE failed · dead_letter not present';
  END IF;

  RAISE NOTICE 'POST-CHECK · dead_letter present in sala_event_type_enum · OK';
END $$;

-- =====================================================================
-- §7 · NOTA reversal complejo (informativo · NO ejecutar sin §144)
-- =====================================================================
-- Postgres no permite DROP VALUE FROM ENUM. Si por alguna razón se
-- necesita ELIMINAR el value `dead_letter` del enum (no solo dejar
-- de emitirlo), el procedimiento canónico requiere ·
--
-- 1. ALTER TABLE sala_event_log ALTER COLUMN event_type TYPE TEXT;
--    (perder constraint enum temporalmente · todas las queries siguen)
-- 2. DROP TYPE sala_event_type_enum;
-- 3. CREATE TYPE sala_event_type_enum AS ENUM ('dispatch_requested',
--    'step_started', 'step_completed', 'step_failed', 'handoff',
--    'gate_pending', 'gate_resolved', 'needs_judgment',
--    'judgment_resolved', 'budget_blocked'); -- SIN 'dead_letter'
-- 4. UPDATE sala_event_log SET event_type = 'step_failed' WHERE
--    event_type = 'dead_letter';  (migrate existing dead_letter rows)
-- 5. ALTER TABLE sala_event_log ALTER COLUMN event_type TYPE
--    sala_event_type_enum USING event_type::sala_event_type_enum;
--
-- Riesgos · #4 pierde la distinción terminal vs transient · #5 fail si
-- alguna fila quedó sin migrar. NO ejecutar este reverso sin §144.
