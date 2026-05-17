-- Cowork message inbox · dashboard chat panel persists messages here ·
-- next Cowork (Lenovo / HP3) session reads pending entries on first turn.
--
-- RLS · service-role only · the dashboard endpoint authenticates with
-- SUPABASE_SERVICE_ROLE_KEY and is the sole writer. No client-side
-- writes; the table is invisible to anon/authenticated roles.

create extension if not exists "pgcrypto";

create table if not exists public.cowork_messages (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  sender_user_id  text,                            -- free-form · e.g. "emilio"
  content         text not null,
  status          text not null default 'pending', -- pending | read | responded
  response_content text,
  responded_at    timestamptz,
  metadata        jsonb default '{}'::jsonb,
  constraint cowork_messages_status_check
    check (status in ('pending', 'read', 'responded'))
);

create index if not exists cowork_messages_status_idx
  on public.cowork_messages (status, created_at desc);

create index if not exists cowork_messages_created_at_idx
  on public.cowork_messages (created_at desc);

alter table public.cowork_messages enable row level security;

-- No policies for anon/authenticated · service-role bypasses RLS.
-- Documented for clarity:
comment on table public.cowork_messages is
  'Dashboard Cowork chat inbox · service-role-only writes from /api/cowork/message · next Cowork session reads pending first.';
