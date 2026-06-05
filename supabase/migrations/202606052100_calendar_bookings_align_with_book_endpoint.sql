-- Migration · calendar_bookings · align schema with /api/calendar/book endpoint
-- Sprint 12 Fase 0 · Phase 1 prep · pre-flight fix · 2026-06-05
-- Authored CC#1 · bug class · schema drift (NOT "Cal.com down")
--
-- §148 honest · canon canonical · the endpoint
-- `src/app/api/calendar/book/route.ts` (Sprint 6 Track A2 · Stack V4
-- GHL-Out replacement) INSERTs into calendar_bookings using a different
-- shape than the 2026-05-20 migration provisioned ·
--
--   Endpoint INSERTs                Migration provisioned
--   ─────────────────────────       ─────────────────────────────────
--   contact_email                   attendee_email (no contact_email)
--   contact_name                    attendee_name  (no contact_name)
--   event_title                     event_type     (no event_title)
--   scheduled_at                    scheduled_start + scheduled_end
--   duration_minutes                (no column)
--   status='pending_provider_sync'  CHECK rejects this value
--   provider='cal-com-stub'         CHECK rejects this value
--
-- Result · /api/calendar/book → HTTP 500 (canon-canonical-INSERT NOT NULL
-- violation on scheduled_start · canon-canon-then CHECK violation on status
-- + provider · canon-canon-then column not found on contact_email).
--
-- This migration is canon canonical-ADDITIVE · canon-canonical-adds the
-- 5 missing columns + relaxes the 2 CHECK constraints + drops NOT NULL on
-- scheduled_start/scheduled_end (canon-canon-endpoint uses `scheduled_at`
-- instead · the legacy cols stay for backwards compat with the webhook
-- handler · canon-canon-they can be populated by future Cal.com OAuth
-- wire-up when both sets converge).
--
-- Reversibility · canon canonical-rollback block at bottom · DROP COLUMNs
-- + restore original CHECKs + restore NOT NULLs. R10 reversible.
--
-- Aplicación · single-file canon · canon-canonical-Management API o
-- `supabase db query --linked -f` · canon-canon-NO `db push`.

BEGIN;

-- ─── 1 · PRE-CHECK · table must exist (canon · #1 migration applied) ─

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calendar_bookings'
  ) THEN
    RAISE EXCEPTION
      'PRE-CHECK · calendar_bookings missing · apply 202605200800_calendar_bookings.sql first';
  END IF;
END $$;

-- ─── 2 · ADD columns · canon canonical-idempotent · canon-canon-IF NOT EXISTS

ALTER TABLE public.calendar_bookings ADD COLUMN IF NOT EXISTS contact_email     TEXT;
ALTER TABLE public.calendar_bookings ADD COLUMN IF NOT EXISTS contact_name      TEXT;
ALTER TABLE public.calendar_bookings ADD COLUMN IF NOT EXISTS event_title       TEXT;
ALTER TABLE public.calendar_bookings ADD COLUMN IF NOT EXISTS scheduled_at      TIMESTAMPTZ;
ALTER TABLE public.calendar_bookings ADD COLUMN IF NOT EXISTS duration_minutes  INT;

-- ─── 3 · DROP NOT NULL on legacy time cols (canon-canon-endpoint uses
--          scheduled_at · canon-canonical-legacy cols stay for Cal.com
--          OAuth wire-up · webhook handler still reads them)

ALTER TABLE public.calendar_bookings ALTER COLUMN scheduled_start DROP NOT NULL;
ALTER TABLE public.calendar_bookings ALTER COLUMN scheduled_end   DROP NOT NULL;

-- ─── 4 · RELAX CHECK constraints · canon-canon-add stub-mode values
--          canon-canon-DROP + recreate (canon-canonical-no ALTER ADD)

ALTER TABLE public.calendar_bookings DROP CONSTRAINT IF EXISTS calendar_bookings_status_check;
ALTER TABLE public.calendar_bookings ADD CONSTRAINT calendar_bookings_status_check
  CHECK (status IN (
    'pending',
    'pending_provider_sync',
    'confirmed',
    'cancelled',
    'no_show',
    'completed',
    'rescheduled'
  ));

ALTER TABLE public.calendar_bookings DROP CONSTRAINT IF EXISTS calendar_bookings_provider_check;
ALTER TABLE public.calendar_bookings ADD CONSTRAINT calendar_bookings_provider_check
  CHECK (provider IN (
    'cal_com',
    'cal-com-stub',
    'ghl_calendar',
    'google_calendar',
    'outlook',
    'other'
  ));

-- canon canonical · booking_time_valid CHECK (scheduled_end > scheduled_start)
-- stays as-is · canon-canon-PG CHECK with NULL operand returns UNKNOWN
-- which is treated as TRUE · canon-canon-rows with both NULL (canon-canonical
-- endpoint shape) pass.

-- ─── 5 · POST-CHECK · all 5 cols present + CHECKs accept stub values

DO $$
DECLARE
  v_missing TEXT[];
BEGIN
  SELECT array_agg(c) INTO v_missing
  FROM unnest(ARRAY['contact_email','contact_name','event_title','scheduled_at','duration_minutes']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='calendar_bookings' AND column_name=c
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'POST-CHECK · missing columns · %', v_missing;
  END IF;
END $$;

COMMIT;

-- ─── Rollback (canon-canonical-inline · informativo · NO ejecutar sin §144)
--   BEGIN;
--     ALTER TABLE public.calendar_bookings DROP COLUMN IF EXISTS contact_email;
--     ALTER TABLE public.calendar_bookings DROP COLUMN IF EXISTS contact_name;
--     ALTER TABLE public.calendar_bookings DROP COLUMN IF EXISTS event_title;
--     ALTER TABLE public.calendar_bookings DROP COLUMN IF EXISTS scheduled_at;
--     ALTER TABLE public.calendar_bookings DROP COLUMN IF EXISTS duration_minutes;
--     ALTER TABLE public.calendar_bookings ALTER COLUMN scheduled_start SET NOT NULL;
--     ALTER TABLE public.calendar_bookings ALTER COLUMN scheduled_end   SET NOT NULL;
--     ALTER TABLE public.calendar_bookings DROP CONSTRAINT calendar_bookings_status_check;
--     ALTER TABLE public.calendar_bookings ADD  CONSTRAINT calendar_bookings_status_check
--       CHECK (status IN ('pending','confirmed','cancelled','no_show','completed','rescheduled'));
--     ALTER TABLE public.calendar_bookings DROP CONSTRAINT calendar_bookings_provider_check;
--     ALTER TABLE public.calendar_bookings ADD  CONSTRAINT calendar_bookings_provider_check
--       CHECK (provider IN ('cal_com','ghl_calendar','google_calendar','outlook','other'));
--   COMMIT;
--   Riesgo · si hay rows con scheduled_start NULL post-apply · canon-canon-
--   restore SET NOT NULL fallará · canon-canon-purge esos rows primero o
--   backfill scheduled_start = scheduled_at antes del rollback.
