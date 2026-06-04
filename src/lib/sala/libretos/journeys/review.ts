/**
 * REVIEW libreto · DRAFT · shadow.
 *
 * Source · QBR Generator Quarterly (cron `0 4 1 1,4,7,10 *` per CC#3
 * §7.1 · 4× per year + manual webhook) + Master Nivel 1 REVIEW branch
 * (which POSTs to /webhook/journey-e per CC#3 §3.2).
 *
 * Translation · in the Sala, REVIEW is the quarterly business review
 * journey · gather data → generate QBR → HITL approval → distribute.
 * The cron trigger fires per client quarterly (or the operator
 * triggers ad-hoc via webhook).
 *
 * Status · draft · pending router build.
 */
import type { Libreto } from '../types'

export const reviewLibreto: Libreto = {
  journey_type: 'REVIEW',
  version: 1,
  description:
    'Quarterly business review · gather metrics · generate QBR document · HITL approval · distribute to client',
  entry_step_id: 'collect_metrics',
  steps: [
    {
      step_id: 'collect_metrics',
      step_type: 'action',
      agent_id: 'analytics-agent',
      description: 'Pull quarter-over-quarter metrics from analytics + CRM',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 2000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'parallel_analysis' },
    },
    {
      step_id: 'parallel_analysis',
      step_type: 'fork',
      description:
        'Parallel · ad-spend analysis + content performance + competitive snapshot · all feed reporting-agent',
      branches: ['ad_spend_analysis', 'content_performance', 'competitive_snapshot'],
      join_at: 'join_analysis',
    },
    {
      step_id: 'ad_spend_analysis',
      step_type: 'action',
      agent_id: 'media-buyer',
      description: 'Analyse paid spend ROAS / CAC / LTV trends',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 2000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_analysis' },
    },
    {
      step_id: 'content_performance',
      step_type: 'action',
      agent_id: 'content-analyst',
      description: 'Top-performing organic content · what drove engagement',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 2000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_analysis' },
    },
    {
      step_id: 'competitive_snapshot',
      step_type: 'action',
      agent_id: 'competitive-intelligence-agent',
      description: 'Quarterly competitive movement snapshot',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 2000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_analysis' },
    },
    {
      step_id: 'join_analysis',
      step_type: 'join',
      waits_for: ['ad_spend_analysis', 'content_performance', 'competitive_snapshot'],
      next_step: { kind: 'static', step_id: 'generate_qbr' },
    },
    {
      step_id: 'generate_qbr',
      step_type: 'action',
      agent_id: 'reporting-agent',
      description:
        'Synthesise QBR document · narrative + insights + next-quarter recommendations',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 2000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'qbr_hitl_approval' },
    },
    {
      step_id: 'qbr_hitl_approval',
      step_type: 'gate_hitl',
      description:
        'Operator reviews QBR before client receives · QBRs are externally facing',
      gate_config: {
        timeout_ms: 5 * 24 * 60 * 60 * 1000,
        escalate_to: 'gate_144',
        description:
          'QBR draft ready · operator approves wording / numbers before client send',
      },
      next_step: { kind: 'static', step_id: 'distribute_qbr' },
      next_step_rejected: 'generate_qbr',
    },
    {
      step_id: 'distribute_qbr',
      step_type: 'action',
      agent_id: 'communications-agent',
      description:
        'Send QBR to client via email + Notion subpage + record in CRM',
      retry_budget: {
        max_attempts: 5,
        initial_backoff_ms: 1000,
        max_backoff_ms: 60_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'qbr_sent' },
    },
    {
      step_id: 'qbr_sent',
      step_type: 'terminal_success',
      description: 'QBR delivered to client · cycle ends · next cron quarter',
    },
  ],
  metadata: {
    source_workflow: 'qbr_generator_quarterly',
    status: 'draft',
    notes:
      'Draft synthesised from QBR Generator + Master Nivel 1 REVIEW branch. Uses fork/join to parallelise the 3 analysis legs · joins into reporting-agent for synthesis · HITL gate before client receives the document (externally visible content per Opus convention). 5-day timeout on HITL with §144 escalation if operator misses the window.',
  },
}
