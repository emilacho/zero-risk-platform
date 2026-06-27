-- Track P · agent_callback_attempts · per-attempt audit trail for the async
-- callback dispatch (SPEC 2026-06-09 · §144 GO 2026-06-26).
--
-- Capa 2 of Track P · the `dispatchAsyncCallback` lib
-- (src/lib/agent-async-callback/index.ts) emits one row per attempt via the
-- `onAttempt` hook · persisted here by
-- src/lib/agent-async-callback/persist-attempt.ts. Canon guardrail 4
-- (audit trail) · gives observability to the silent-callback-failure that
-- left n8n execs stuck on Wait (round 6 verde / round 7 rojo).
--
-- Migration is SINGLE-FILE per R10. To apply (§144 separate step) ·
--   psql ... < 202606270001_agent_callback_attempts.sql
-- Do NOT use `db push` per canon (drift risk).
--
-- §148 honest · this migration is NOT applied in this PR. Until applied, the
-- persist layer logs to console.error only (the insert errors with "relation
-- does not exist") · the callback itself proceeds regardless.

-- ─── PRE-CHECK ──────────────────────────────────────────────────────
-- Refuse to run if the table already exists with a different shape · canon
-- is THIS schema · drift = §144 review.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_callback_attempts'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_callback_attempts'
        AND column_name IN (
          'id', 'workflow_id', 'callback_url', 'attempt_number',
          'status', 'http_status_code', 'error_message', 'attempted_at'
        )
      GROUP BY table_schema, table_name
      HAVING COUNT(DISTINCT column_name) = 8
    ) THEN
      RAISE EXCEPTION 'agent_callback_attempts exists with a DIFFERENT shape · drift · §144 review required';
    END IF;
    RAISE NOTICE 'agent_callback_attempts already present with canonical shape · CREATE TABLE IF NOT EXISTS is no-op below';
  END IF;
END $$;

-- ─── TABLE ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_callback_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- §149 attribution · which workflow execution owned this callback. Nullable
  -- because a malformed caller may omit it (we still want the failure row).
  workflow_id      text,
  -- The resume URL the callback targeted (n8n $execution.resumeUrl).
  callback_url     text NOT NULL,
  -- 1-indexed attempt counter (1 = first/immediate · up to max_attempts).
  attempt_number   integer NOT NULL,
  -- Outcome tag · 'ok' | 'invalid_url' | 'fetch_threw' | 'timeout'
  --             | 'non_2xx' | 'callback_threw'.
  status           text NOT NULL,
  -- HTTP status when the POST got a response (null on timeout/throw).
  http_status_code integer,
  -- Failure detail (null on success).
  error_message    text,
  -- When the attempt fired (ISO · set by the app · default for safety).
  attempted_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── INDEXES ────────────────────────────────────────────────────────
-- Forensics queries · "show me the attempts for this stuck workflow" +
-- "all failed callbacks in the last hour".

CREATE INDEX IF NOT EXISTS idx_agent_callback_attempts_workflow_id
  ON public.agent_callback_attempts (workflow_id);

CREATE INDEX IF NOT EXISTS idx_agent_callback_attempts_attempted_at
  ON public.agent_callback_attempts (attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_callback_attempts_status
  ON public.agent_callback_attempts (status);

-- ─── RLS ────────────────────────────────────────────────────────────
-- Single-tenant canon · service-role writes only (the route uses the service
-- key · bypasses RLS). Enable RLS with NO public policy so anon/auth cannot
-- read the audit trail. Matches the deny-by-default posture (cc1-rls lockdown).

ALTER TABLE public.agent_callback_attempts ENABLE ROW LEVEL SECURITY;

-- ─── POST-CHECK ─────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_callback_attempts'
  ) THEN
    RAISE EXCEPTION 'POST-CHECK FAILED · agent_callback_attempts not created';
  END IF;
  RAISE NOTICE 'agent_callback_attempts · canonical shape verified';
END $$;
