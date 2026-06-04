/**
 * PRODUCE libreto · DRAFT · shadow.
 *
 * Source · NEXUS 7-Phase Campaign Orchestrator (n8n RT1tcru9mysEwKkf
 * · 23 nodes · state machine pattern per CC#3 §4). NEXUS encodes the
 * canonical complex libreto: phase loop with validation gates, retry
 * budget tracking, HITL escalation cascade, DLQ on terminal fail.
 *
 * The 7 phases here map 1-to-1 to the NEXUS phase progression. Each
 * phase is an `action` step invoking jefe-marketing (the phase
 * dispatcher in NEXUS), with a `gate_camino_iii` between phases to
 * run validation per phase (Pattern 2 in CC#3 §4.2).
 *
 * Status · draft · pending router build + jefe-marketing wiring.
 */
import type { Libreto } from '../types'

const PHASE_RETRY_BUDGET = {
  max_attempts: 3,
  initial_backoff_ms: 2000,
  max_backoff_ms: 60_000,
  on_exhausted: 'gate_hitl' as const,
}

export const produceLibreto: Libreto = {
  journey_type: 'PRODUCE',
  version: 1,
  description:
    '7-phase campaign production · jefe-marketing dispatches each phase · validation gate per phase · HITL escalation on retry exhaustion · DLQ on terminal fail',
  entry_step_id: 'phase_1_strategy',
  steps: [
    {
      step_id: 'phase_1_strategy',
      step_type: 'action',
      agent_id: 'jefe-marketing',
      description: 'Phase 1 · Strategy · brief + audience + offer framing',
      retry_budget: PHASE_RETRY_BUDGET,
      next_step: { kind: 'static', step_id: 'validate_phase_1' },
    },
    {
      step_id: 'validate_phase_1',
      step_type: 'gate_camino_iii',
      description: 'Validate phase 1 strategy output',
      gate_config: {
        timeout_ms: 24 * 60 * 60 * 1000,
        escalate_to: 'hitl',
        description: 'Camino III · validate phase 1 strategy',
      },
      next_step: { kind: 'static', step_id: 'phase_2_research' },
      next_step_rejected: 'phase_1_strategy',
    },
    {
      step_id: 'phase_2_research',
      step_type: 'action',
      agent_id: 'jefe-marketing',
      description: 'Phase 2 · Research · competitive + audience deep-dive',
      retry_budget: PHASE_RETRY_BUDGET,
      next_step: { kind: 'static', step_id: 'validate_phase_2' },
    },
    {
      step_id: 'validate_phase_2',
      step_type: 'gate_camino_iii',
      description: 'Validate phase 2 research output',
      gate_config: {
        timeout_ms: 24 * 60 * 60 * 1000,
        escalate_to: 'hitl',
        description: 'Camino III · validate phase 2 research',
      },
      next_step: { kind: 'static', step_id: 'phase_3_creative' },
      next_step_rejected: 'phase_2_research',
    },
    {
      step_id: 'phase_3_creative',
      step_type: 'action',
      agent_id: 'jefe-marketing',
      description: 'Phase 3 · Creative · concept + visual direction',
      retry_budget: PHASE_RETRY_BUDGET,
      next_step: { kind: 'static', step_id: 'validate_phase_3' },
    },
    {
      step_id: 'validate_phase_3',
      step_type: 'gate_camino_iii',
      description: 'Validate phase 3 creative direction',
      gate_config: {
        timeout_ms: 24 * 60 * 60 * 1000,
        escalate_to: 'hitl',
        description: 'Camino III · validate phase 3 creative',
      },
      next_step: { kind: 'static', step_id: 'phase_4_content' },
      next_step_rejected: 'phase_3_creative',
    },
    {
      step_id: 'phase_4_content',
      step_type: 'action',
      agent_id: 'jefe-marketing',
      description: 'Phase 4 · Content · copy + script + storyboard',
      retry_budget: PHASE_RETRY_BUDGET,
      next_step: { kind: 'static', step_id: 'validate_phase_4' },
    },
    {
      step_id: 'validate_phase_4',
      step_type: 'gate_camino_iii',
      description: 'Validate phase 4 content',
      gate_config: {
        timeout_ms: 24 * 60 * 60 * 1000,
        escalate_to: 'hitl',
        description: 'Camino III · validate phase 4 content',
      },
      next_step: { kind: 'static', step_id: 'phase_5_assets' },
      next_step_rejected: 'phase_4_content',
    },
    {
      step_id: 'phase_5_assets',
      step_type: 'action',
      agent_id: 'jefe-marketing',
      description: 'Phase 5 · Assets · images + video + landing components',
      retry_budget: PHASE_RETRY_BUDGET,
      next_step: { kind: 'static', step_id: 'validate_phase_5' },
    },
    {
      step_id: 'validate_phase_5',
      step_type: 'gate_camino_iii',
      description: 'Validate phase 5 assets',
      gate_config: {
        timeout_ms: 24 * 60 * 60 * 1000,
        escalate_to: 'hitl',
        description: 'Camino III · validate phase 5 assets',
      },
      next_step: { kind: 'static', step_id: 'phase_6_distribution' },
      next_step_rejected: 'phase_5_assets',
    },
    {
      step_id: 'phase_6_distribution',
      step_type: 'action',
      agent_id: 'jefe-marketing',
      description:
        'Phase 6 · Distribution · channel plan + scheduling + budget allocation',
      retry_budget: PHASE_RETRY_BUDGET,
      next_step: { kind: 'static', step_id: 'validate_phase_6' },
    },
    {
      step_id: 'validate_phase_6',
      step_type: 'gate_camino_iii',
      description: 'Validate phase 6 distribution plan',
      gate_config: {
        timeout_ms: 24 * 60 * 60 * 1000,
        escalate_to: 'hitl',
        description: 'Camino III · validate phase 6 distribution',
      },
      next_step: { kind: 'static', step_id: 'phase_7_launch_brief' },
      next_step_rejected: 'phase_6_distribution',
    },
    {
      step_id: 'phase_7_launch_brief',
      step_type: 'action',
      agent_id: 'campaign-brief-agent',
      description:
        'Phase 7 · Launch brief · campaign-brief-agent merges all phase context (Pattern 7 in CC#3 §4.2)',
      retry_budget: PHASE_RETRY_BUDGET,
      next_step: { kind: 'static', step_id: 'launch_approval' },
    },
    {
      step_id: 'launch_approval',
      step_type: 'gate_144',
      description:
        '§144 Emilio approves the campaign before MC notification + downstream pipeline',
      gate_config: {
        timeout_ms: 7 * 24 * 60 * 60 * 1000,
        description:
          'Campaign brief ready · Emilio §144 approves launch · MC observability event emitted on approve',
      },
      next_step: { kind: 'static', step_id: 'campaign_ready' },
      next_step_rejected: 'phase_4_content',
    },
    {
      step_id: 'campaign_ready',
      step_type: 'terminal_success',
      description: 'Campaign brief approved · ready for downstream execution',
    },
  ],
  metadata: {
    source_workflow: 'RT1tcru9mysEwKkf',
    status: 'draft',
    notes:
      'Draft based on NEXUS 7-Phase state machine (CC#3 §4). Each phase dispatches via jefe-marketing per the existing pattern · validation gate after each phase is Camino III (early intent already present per CC#3 Pattern 2). Retry budget per phase wires to G6 atomic counter (Mitad 2). Final §144 gate before campaign goes downstream.',
  },
}
