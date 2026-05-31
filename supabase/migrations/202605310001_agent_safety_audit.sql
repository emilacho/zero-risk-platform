-- Migration · agent_safety_audit · PR #128 build-phase
-- Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §7.1
-- Canon · §148 honest reporting · §149 workflow_id enforcement · §150 G3 + G6 guardrails
--
-- Purpose · single-source-of-truth log of every killSwitch pass.
-- One row per invocation regardless of allow/block · contains full gates[]
-- decision array so shadow-mode gates leave evidence too.
--
-- Indexes optimize for (a) timeline forensics (ran_at DESC) ·
-- (b) blocked-request post-mortem (allow=false partial) · (c) shadow gate
-- baseline analysis (shadow_block_count>0 partial) · (d) §149 NULL-workflow
-- pattern detection (workflow_id IS NULL partial · hot 24-may use case).
--
-- RLS · admin_emilio OR service_role only.

CREATE TABLE public.agent_safety_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,           -- minted by killSwitch · returned to caller
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Context snapshot
  workflow_id TEXT,                          -- nullable · NULL IS the signal §149 audits
  workflow_execution_id TEXT,
  client_id TEXT,
  agent_id TEXT NOT NULL,
  caller TEXT NOT NULL,                      -- 'n8n' | 'pipeline' | 'api' | 'smoke' | 'cron'
  estimated_cost_usd NUMERIC(10, 4),

  -- Decision summary
  allow BOOLEAN NOT NULL,                    -- false ONLY if any gate enforced
  block_gate TEXT,
  block_reason TEXT,
  shadow_block_count INT NOT NULL DEFAULT 0,
  shadow_block_gates TEXT[],

  -- Full gates[] array (per-gate decisions · audit-grade detail)
  gates JSONB NOT NULL,                      -- [{ gate, shadow_mode, would_reject, enforced, reason, metadata }, ...]

  endpoint TEXT NOT NULL,                    -- '/api/agents/run' | '/api/agents/run-sdk' | 'railway-direct'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_safety_audit_ran_at ON public.agent_safety_audit (ran_at DESC);
CREATE INDEX idx_agent_safety_audit_block ON public.agent_safety_audit (ran_at DESC) WHERE allow = false;
CREATE INDEX idx_agent_safety_audit_shadow ON public.agent_safety_audit (ran_at DESC) WHERE shadow_block_count > 0;
CREATE INDEX idx_agent_safety_audit_workflow_null ON public.agent_safety_audit (ran_at DESC) WHERE workflow_id IS NULL;

ALTER TABLE public.agent_safety_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_only_safety_audit ON public.agent_safety_audit
  USING (current_setting('request.jwt.claims', true)::json->>'role' IN ('admin_emilio', 'service_role'));

COMMENT ON TABLE public.agent_safety_audit IS
  'PR #128 v2 §7.1 · single-source-of-truth audit log for killSwitch decisions · 1 row per invocation · canon §148 honest reporting';
