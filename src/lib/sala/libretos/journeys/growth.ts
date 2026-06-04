/**
 * GROWTH libreto · DRAFT · pending §144 Emilio decision.
 *
 * NEW journey · not present in Master Nivel 1 ugK3 switch (which has
 * only 5 branches per CC#3 §7.2). Per CC#3 recommendation §11.5 ·
 * "GROWTH journey · agregar libreto nuevo SIN tocar router" · GROWTH
 * is added by INSERT-ing a new libreto data file (this one), no code
 * deploy.
 *
 * Per CC#3 §13 §144 decision #1 · Emilio confirms whether to adopt
 * the 6-journey taxonomy (vs the legacy 5). Until that decision lands,
 * this libreto is marked `pending_144` · the router renders an
 * explicit `needs_judgment` path when a GROWTH event arrives, so
 * nothing silently dispatches.
 *
 * Source · CC#3 §7.1 taxonomy · "YouTube growth · per-cliente tier".
 *
 * Status · DRAFT · pending_144 · NOT enforceable until Emilio §144.
 */
import type { Libreto } from '../types'

export const growthLibreto: Libreto = {
  journey_type: 'GROWTH',
  version: 1,
  description:
    'YouTube growth tier per-client · channel strategy → content production → distribution → analytics loop · NEW journey · pending §144',
  entry_step_id: 'pending_144_gate',
  steps: [
    {
      step_id: 'pending_144_gate',
      step_type: 'gate_144',
      description:
        '§144 Emilio confirms GROWTH adoption (6-journey taxonomy) before any GROWTH event dispatches downstream',
      gate_config: {
        timeout_ms: null,
        description:
          'GROWTH journey is new · Emilio §144 confirms adopt vs reject vs scope. Until approved, every GROWTH event freezes here.',
      },
      next_step: { kind: 'static', step_id: 'channel_strategy' },
      next_step_rejected: 'growth_rejected',
    },
    {
      step_id: 'channel_strategy',
      step_type: 'action',
      agent_id: 'brand-strategist',
      description: 'YouTube channel strategy · positioning, format, cadence',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'content_calendar' },
    },
    {
      step_id: 'content_calendar',
      step_type: 'action',
      agent_id: 'marketing-content-creator',
      description:
        '8-week content calendar · scripts, B-roll plan, hook variations',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'parallel_production' },
    },
    {
      step_id: 'parallel_production',
      step_type: 'fork',
      description: 'Parallel · video production + thumbnails + descriptions',
      branches: ['video_production', 'thumbnails', 'descriptions_seo'],
      join_at: 'join_production',
    },
    {
      step_id: 'video_production',
      step_type: 'action',
      agent_id: 'video-production-agent',
      description: 'Generate / coordinate video assets (Veo 3.1 tier)',
      retry_budget: {
        max_attempts: 2,
        initial_backoff_ms: 5000,
        max_backoff_ms: 120_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_production' },
    },
    {
      step_id: 'thumbnails',
      step_type: 'action',
      agent_id: 'creative-director',
      description: 'Thumbnail set per video · A/B variants',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_production' },
    },
    {
      step_id: 'descriptions_seo',
      step_type: 'action',
      agent_id: 'seo-specialist',
      description: 'Video descriptions + tags + chapters · YouTube SEO',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_production' },
    },
    {
      step_id: 'join_production',
      step_type: 'join',
      waits_for: ['video_production', 'thumbnails', 'descriptions_seo'],
      next_step: { kind: 'static', step_id: 'publish_approval' },
    },
    {
      step_id: 'publish_approval',
      step_type: 'gate_hitl',
      description:
        'Operator approves video package before publish · externally visible content',
      gate_config: {
        timeout_ms: 5 * 24 * 60 * 60 * 1000,
        escalate_to: 'gate_144',
        description:
          'Video package ready · operator approves the full set (video + thumb + description) before YouTube publish',
      },
      next_step: { kind: 'static', step_id: 'publish_video' },
      next_step_rejected: 'content_calendar',
    },
    {
      step_id: 'publish_video',
      step_type: 'action',
      agent_id: 'youtube-publisher',
      description: 'Upload to YouTube with schedule + metadata',
      retry_budget: {
        max_attempts: 5,
        initial_backoff_ms: 2000,
        max_backoff_ms: 120_000,
        on_exhausted: 'dead_letter',
      },
      next_step: { kind: 'static', step_id: 'analytics_loop_pending' },
    },
    {
      step_id: 'analytics_loop_pending',
      step_type: 'gate_hitl',
      description:
        'Awaiting 7-day analytics window · operator triggers retro when data lands',
      gate_config: {
        timeout_ms: 14 * 24 * 60 * 60 * 1000,
        description:
          'Wait 7-14 days · operator triggers retrospective once enough analytics signal accumulates',
      },
      next_step: { kind: 'static', step_id: 'retro_loop' },
    },
    {
      step_id: 'retro_loop',
      step_type: 'action',
      agent_id: 'analytics-agent',
      description:
        'Retrospective on the published video · what worked + recommendations for next batch',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 2000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'cycle_complete' },
    },
    {
      step_id: 'cycle_complete',
      step_type: 'terminal_success',
      description: 'GROWTH cycle complete · retro learning fed back to next batch',
    },
    {
      step_id: 'growth_rejected',
      step_type: 'terminal_failure',
      description:
        '§144 rejected · GROWTH not adopted yet · libreto remains in pending_144 status',
    },
  ],
  metadata: {
    source_workflow: undefined, // greenfield
    status: 'pending_144',
    pending_decisions: [
      'CC#3 §13 §144 decision #1 · adopt 6-journey taxonomy (vs legacy 5) · GROWTH is the 6th',
      'GROWTH tier scope · YouTube only vs broader expansion · operator confirms scope at §144',
    ],
    notes:
      'Greenfield libreto · NOT present in Master Nivel 1 switch. First step is a §144 gate so nothing dispatches downstream without Emilio approval. Once §144 confirms adoption, status flips draft → ready and the entry gate becomes a no-op (auto-approve) per router policy.',
  },
}
