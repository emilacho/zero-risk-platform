/**
 * ACQUIRE libreto · DRAFT · shadow.
 *
 * Source · Journey A ACQUIRE sub-workflow (DEACTIVATED per CC#3
 * §7.1) + Master Nivel 1 ACQUIRE branch (which executes the sub-wf
 * via n8n executeWorkflowTrigger per CC#3 §3.2). Journey A never
 * ran in production (0 executions per CC#3 §1).
 *
 * §144 decision pending · Emilio decides whether to reactivate the
 * deactivated Journey A sub-wf, replace it, or scope it down. The
 * libreto draft here represents the design intent so the router can
 * absorb it · the operator can flip on/off via metadata.status.
 *
 * Translation · in the Sala, ACQUIRE qualifies inbound leads · RUFLO
 * classifies the lead, brand-strategist + market-research-analyst
 * propose fit, business-development-agent reaches out (HITL-gated).
 *
 * Status · draft · pending §144 (reactivate sub-wf vs replace · CC#3
 * §13 §144 decision #3).
 */
import type { Libreto } from '../types'

export const acquireLibreto: Libreto = {
  journey_type: 'ACQUIRE',
  version: 1,
  description:
    'Inbound lead qualification · RUFLO classifies · strategist + research analyst score fit · business-development-agent reaches out (HITL-gated)',
  entry_step_id: 'classify_lead',
  steps: [
    {
      step_id: 'classify_lead',
      step_type: 'action',
      agent_id: 'ruflo',
      description:
        'RUFLO classifies the lead · ICP fit, intent signal, urgency',
      retry_budget: {
        max_attempts: 2,
        initial_backoff_ms: 500,
        max_backoff_ms: 5000,
        on_exhausted: 'gate_hitl',
      },
      next_step: {
        kind: 'conditional',
        conditions: [
          { when: 'classification.fit_is_high', then: 'parallel_fit' },
          { when: 'classification.fit_is_medium', then: 'parallel_fit' },
          { when: 'classification.fit_is_low', then: 'low_fit_nurture' },
        ],
        default: 'needs_judgment',
      },
    },
    {
      step_id: 'parallel_fit',
      step_type: 'fork',
      description:
        'Parallel · brand-strategist + market-research-analyst evaluate the lead',
      branches: ['brand_fit', 'market_fit'],
      join_at: 'join_fit',
    },
    {
      step_id: 'brand_fit',
      step_type: 'action',
      agent_id: 'brand-strategist',
      description: 'Brand fit evaluation · does lead match our positioning',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_fit' },
    },
    {
      step_id: 'market_fit',
      step_type: 'action',
      agent_id: 'market-research-analyst',
      description: 'Market fit · ICP overlap + competitive context',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_fit' },
    },
    {
      step_id: 'join_fit',
      step_type: 'join',
      waits_for: ['brand_fit', 'market_fit'],
      next_step: { kind: 'static', step_id: 'qualify_decision' },
    },
    {
      step_id: 'qualify_decision',
      step_type: 'action',
      agent_id: 'sales-qualifier',
      description: 'Synthesise fit scores · recommend reach out vs drop',
      retry_budget: {
        max_attempts: 2,
        initial_backoff_ms: 1000,
        max_backoff_ms: 10_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: {
        kind: 'conditional',
        conditions: [
          { when: 'recommendation.is_reach_out', then: 'draft_outreach' },
          { when: 'recommendation.is_nurture', then: 'low_fit_nurture' },
          { when: 'recommendation.is_drop', then: 'lead_dropped' },
        ],
        default: 'needs_judgment',
      },
    },
    {
      step_id: 'draft_outreach',
      step_type: 'action',
      agent_id: 'business-development-agent',
      description: 'Draft personalised outreach email + LinkedIn message',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'outreach_hitl' },
    },
    {
      step_id: 'outreach_hitl',
      step_type: 'gate_hitl',
      description:
        'Operator reviews outreach before send · prospect-facing copy',
      gate_config: {
        timeout_ms: 3 * 24 * 60 * 60 * 1000,
        description:
          'Outreach draft ready · operator approves / edits / drops before send',
      },
      next_step: { kind: 'static', step_id: 'send_outreach' },
      next_step_rejected: 'draft_outreach',
    },
    {
      step_id: 'send_outreach',
      step_type: 'action',
      agent_id: 'communications-agent',
      description: 'Send approved outreach via configured channel',
      retry_budget: {
        max_attempts: 5,
        initial_backoff_ms: 1000,
        max_backoff_ms: 60_000,
        on_exhausted: 'dead_letter',
      },
      next_step: { kind: 'static', step_id: 'outreach_sent' },
    },
    {
      step_id: 'low_fit_nurture',
      step_type: 'action',
      agent_id: 'communications-agent',
      description:
        'Low / medium-fit lead · add to nurture sequence · long-cycle drip',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'dead_letter',
      },
      next_step: { kind: 'static', step_id: 'nurtured' },
    },
    {
      step_id: 'needs_judgment',
      step_type: 'gate_hitl',
      description:
        'Unknown classification / recommendation · operator triages (router-total-function per Opus §H-a)',
      gate_config: {
        timeout_ms: 5 * 24 * 60 * 60 * 1000,
        escalate_to: 'gate_144',
        description:
          'Lead does not fit any known path · operator decides reach_out / nurture / drop / reclassify',
      },
      next_step: { kind: 'static', step_id: 'lead_triaged' },
    },
    {
      step_id: 'outreach_sent',
      step_type: 'terminal_success',
      description: 'Outreach sent · CRM updated · awaiting prospect reply',
    },
    {
      step_id: 'nurtured',
      step_type: 'terminal_success',
      description: 'Lead in nurture sequence · long-cycle revisit',
    },
    {
      step_id: 'lead_dropped',
      step_type: 'terminal_success',
      description: 'Lead dropped per recommendation · CRM updated',
    },
    {
      step_id: 'lead_triaged',
      step_type: 'terminal_success',
      description: 'Lead manually triaged · cycle ends',
    },
  ],
  metadata: {
    source_workflow: 'journey_a_acquire_deactivated',
    status: 'draft',
    pending_decisions: [
      'CC#3 §13 §144 decision #3 · Journey A ACQUIRE · reactivate sub-wf or replace · this libreto draft represents the replace path · §144 confirms route',
    ],
    notes:
      'Draft synthesised from Master Nivel 1 ACQUIRE branch (sub-wf DEACTIVATED · 0 executions historical). Replaces the legacy sub-wf with a libreto-as-data path that explicitly routes through fit evaluation + HITL outreach approval. §144 Emilio confirms whether to wire this libreto or stick with the legacy sub-wf reactivation.',
  },
}
