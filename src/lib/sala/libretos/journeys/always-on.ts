/**
 * ALWAYS_ON libreto · DRAFT · shadow.
 *
 * Source · Email Lifecycle Orchestrator (n8n Yo1j0LlBqFVqrihh · 15
 * nodes · event-driven) + Master Nivel 1 ALWAYS_ON branch (which just
 * registers the event via /api/journey/event-log per CC#3 §3.2 · NO
 * spawn agents downstream).
 *
 * Translation · in the Sala, ALWAYS_ON is the steady-state journey
 * that classifies an inbound trigger (email open, webhook from a
 * vendor, etc), records the event, and routes to the appropriate
 * micro-action (no large agent cascade). RUFLO classifies, the
 * router dispatches the single relevant action.
 *
 * Status · draft · pending router build.
 */
import type { Libreto } from '../types'

export const alwaysOnLibreto: Libreto = {
  journey_type: 'ALWAYS_ON',
  version: 1,
  description:
    'Steady-state event-driven journey · classify trigger via RUFLO · dispatch a single micro-action · record outcome',
  entry_step_id: 'classify_trigger',
  steps: [
    {
      step_id: 'classify_trigger',
      step_type: 'action',
      agent_id: 'ruflo',
      description:
        'RUFLO classifies the trigger · output drives the next dispatch (CC#3 Pattern 3 · agent classifies → deterministic dispatches)',
      retry_budget: {
        max_attempts: 2,
        initial_backoff_ms: 500,
        max_backoff_ms: 5000,
        on_exhausted: 'gate_hitl',
      },
      next_step: {
        kind: 'conditional',
        conditions: [
          {
            when: 'classification.is_email_lifecycle',
            then: 'email_responder',
          },
          {
            when: 'classification.is_social_engagement',
            then: 'social_responder',
          },
          {
            when: 'classification.is_review_received',
            then: 'review_responder',
          },
        ],
        default: 'needs_judgment',
      },
    },
    {
      step_id: 'email_responder',
      step_type: 'action',
      agent_id: 'marketing-content-creator',
      description: 'Generate the email response/follow-up artifact',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 15_000,
        on_exhausted: 'dead_letter',
      },
      next_step: { kind: 'static', step_id: 'record_outcome' },
    },
    {
      step_id: 'social_responder',
      step_type: 'action',
      agent_id: 'social-media-manager',
      description: 'Generate the social engagement response',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 15_000,
        on_exhausted: 'dead_letter',
      },
      next_step: { kind: 'static', step_id: 'record_outcome' },
    },
    {
      step_id: 'review_responder',
      step_type: 'action',
      agent_id: 'community-manager',
      description: 'Draft a review response · gated for HITL before publish',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 15_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'review_response_hitl' },
    },
    {
      step_id: 'review_response_hitl',
      step_type: 'gate_hitl',
      description:
        'Human approves the review response before publish · reviews are externally visible',
      gate_config: {
        timeout_ms: 24 * 60 * 60 * 1000,
        description:
          'Review draft ready · operator approves or rewrites before publish',
      },
      next_step: { kind: 'static', step_id: 'record_outcome' },
      next_step_rejected: 'review_responder',
    },
    {
      step_id: 'needs_judgment',
      step_type: 'gate_hitl',
      description:
        'Unknown classification · escalate to operator (router-total-function per Opus §H-a)',
      gate_config: {
        timeout_ms: 48 * 60 * 60 * 1000,
        description:
          'RUFLO could not classify the trigger · operator decides the next step',
      },
      next_step: { kind: 'static', step_id: 'record_outcome' },
    },
    {
      step_id: 'record_outcome',
      step_type: 'action',
      agent_id: 'outcome-recorder',
      description:
        'Persist outcome to the event log (the log is the state · Pattern 6/7 reframe per CC#3 §10)',
      retry_budget: {
        max_attempts: 5,
        initial_backoff_ms: 500,
        max_backoff_ms: 10_000,
        on_exhausted: 'dead_letter',
      },
      next_step: { kind: 'static', step_id: 'cycle_complete' },
    },
    {
      step_id: 'cycle_complete',
      step_type: 'terminal_success',
      description:
        'Always-on cycle complete · next trigger spawns a fresh dispatch',
    },
  ],
  metadata: {
    source_workflow: 'Yo1j0LlBqFVqrihh',
    status: 'draft',
    notes:
      'Draft synthesised from Email Lifecycle Orchestrator + Master Nivel 1 ALWAYS_ON event-log registry. Adds the explicit `needs_judgment` step (Opus §H-a router-total-function) that Master Nivel 1 lacked (Gap #1 per CC#3 §9). Reviewable responses (community/reviews) gated for HITL before publish.',
  },
}
