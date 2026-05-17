-- 3 critical operational tables that were spec'd but missing.
-- All service-role-only RLS; dashboard reads via dashboard repo's
-- service-role client (`lib/supabase-server.ts`).
--
-- Source dispatch · CC1-DASHBOARD-PHASE-4-5-9-PARALELO STEP 1b ·
-- 2026-05-17. Schemas derived from existing patterns in agent_invocations
-- (use snake_case, jsonb metadata, timestamptz fields, soft FKs).

create extension if not exists "pgcrypto";

-- ════════════════════════════════════════════════════════════════════
-- HITL APPROVALS · queue of human-in-the-loop checkpoints
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.hitl_approvals (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  agent_invocation_id   uuid references public.agent_invocations(id) on delete set null,
  client_id             uuid references public.clients(id) on delete cascade,
  status                text not null default 'pending',  -- pending | approved | rejected
  approved_by           text,                              -- e.g. "emilio" · free-form for now
  approved_at           timestamptz,
  rejected_at           timestamptz,
  rejection_reason      text,
  payload               jsonb not null default '{}'::jsonb,  -- the thing awaiting review
  context               jsonb default '{}'::jsonb,            -- agent + cascade refs
  priority              text default 'normal',                -- low | normal | high | urgent
  expires_at            timestamptz,                          -- auto-reject after deadline
  constraint hitl_status_check
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  constraint hitl_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent'))
);

create index if not exists hitl_approvals_status_idx
  on public.hitl_approvals (status, created_at desc);
create index if not exists hitl_approvals_client_idx
  on public.hitl_approvals (client_id, created_at desc);
create index if not exists hitl_approvals_priority_pending_idx
  on public.hitl_approvals (priority, created_at)
  where status = 'pending';

alter table public.hitl_approvals enable row level security;
comment on table public.hitl_approvals is
  'Human-in-the-loop checkpoint queue · service-role writes from agent runtime · dashboard reads via Mission Control.';

-- ════════════════════════════════════════════════════════════════════
-- CASCADE RUNS · one row per cascade-runner.runCascade invocation
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.cascade_runs (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  workflow_id           text,                                 -- optional n8n workflow ID if dispatched from n8n
  client_id             uuid references public.clients(id) on delete cascade,
  cascade_type          text not null default 'content',      -- content | website-build | onboarding | qa-review
  stage                 text,                                 -- last stage reached · text label
  status                text not null default 'running',      -- running | completed | failed | partial
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  duration_ms           integer,
  total_cost_usd        numeric(10, 6) default 0,
  stage_count           integer default 0,
  failed_stages         integer default 0,
  agents_invoked        text[] default '{}',                  -- ['brand-strategist','content-creator',...]
  caller                text default 'platform',              -- platform | n8n | manual
  metadata              jsonb default '{}'::jsonb,
  constraint cascade_runs_status_check
    check (status in ('running', 'completed', 'failed', 'partial', 'cancelled')),
  constraint cascade_runs_type_check
    check (cascade_type in ('content', 'website-build', 'onboarding', 'qa-review', 'meta-ads', 'video-gen', 'other'))
);

create index if not exists cascade_runs_status_idx
  on public.cascade_runs (status, started_at desc);
create index if not exists cascade_runs_client_idx
  on public.cascade_runs (client_id, started_at desc);
create index if not exists cascade_runs_type_idx
  on public.cascade_runs (cascade_type, started_at desc);

alter table public.cascade_runs enable row level security;
comment on table public.cascade_runs is
  'One row per runCascade invocation · stage breakdown lives in cascade_stages · sums spend across agent_invocations linked via metadata.cascade_run_id.';

-- ════════════════════════════════════════════════════════════════════
-- CASCADE STAGES · child rows · one per stage of a cascade run
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.cascade_stages (
  id                    uuid primary key default gen_random_uuid(),
  cascade_run_id        uuid not null references public.cascade_runs(id) on delete cascade,
  agent_name            text not null,
  stage_order           integer not null,
  started_at            timestamptz not null default now(),
  ended_at              timestamptz,
  duration_ms           integer,
  status                text not null default 'running',
  cost_usd              numeric(10, 6) default 0,
  tokens_input          integer default 0,
  tokens_output         integer default 0,
  output_summary        text,
  error                 text,
  agent_invocation_id   uuid references public.agent_invocations(id) on delete set null,
  constraint cascade_stages_status_check
    check (status in ('running', 'completed', 'failed', 'skipped'))
);

create index if not exists cascade_stages_run_order_idx
  on public.cascade_stages (cascade_run_id, stage_order);
create index if not exists cascade_stages_agent_idx
  on public.cascade_stages (agent_name, started_at desc);

alter table public.cascade_stages enable row level security;
comment on table public.cascade_stages is
  'Per-stage detail of a cascade run · 7-stage typical sequence brand-strategist → market-research → creative-director → web-designer → content-creator → spell-check → editor-en-jefe.';

-- ════════════════════════════════════════════════════════════════════
-- JOURNEY EXECUTIONS · client journey state machine
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.journey_executions (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients(id) on delete cascade,
  journey_state         text not null default 'discovery',    -- discovery | onboarding | content | optimizing | reporting | renewal | churned
  stage                 text,                                 -- granular stage label inside the state
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  current_step          integer default 0,
  total_steps           integer default 0,
  agent_outputs         jsonb default '{}'::jsonb,            -- accumulated outputs per agent in the journey
  metadata              jsonb default '{}'::jsonb,
  last_activity_at      timestamptz default now(),
  constraint journey_state_check
    check (journey_state in ('discovery', 'onboarding', 'content', 'optimizing', 'reporting', 'renewal', 'churned'))
);

create unique index if not exists journey_executions_client_unique_idx
  on public.journey_executions (client_id)
  where completed_at is null;

create index if not exists journey_executions_state_idx
  on public.journey_executions (journey_state, last_activity_at desc);

alter table public.journey_executions enable row level security;
comment on table public.journey_executions is
  'Per-client journey state · one ACTIVE journey per client at a time (enforced via partial unique index on completed_at IS NULL).';
