/**
 * ONBOARD libreto · DRAFT · shadow.
 *
 * Source · Journey B ONBOARD Pipeline (n8n RwUo7G2PmZNqyMbe · 32
 * nodes · 24 HTTP POST sync cascade · only journey workflow that
 * ever ran historically · 15 invocations pre-window per CC#3 §7.1).
 *
 * Translation · the Pattern A sync HTTP cascade (Gap #4 per CC#3
 * §9) becomes handoffs-via-log here. Each agent invocation is an
 * `action` step whose completion event the router reads to decide
 * the next dispatch. Gap #4 is the load-bearing reason this journey
 * is the migration pilot.
 *
 * Status · draft · pending router build + Mitad 2 wire to actually
 * dispatch these.
 */
import type { Libreto } from '../types'

export const onboardLibreto: Libreto = {
  journey_type: 'ONBOARD',
  version: 1,
  description:
    'New client signed · pipeline kickoff · brand strategy → research → creative → web design → content → editor QA → launch',
  entry_step_id: 'onboarding_specialist',
  steps: [
    {
      step_id: 'onboarding_specialist',
      step_type: 'action',
      agent_id: 'onboarding-specialist',
      description:
        'Parse client brief · enrich Brain RAG · seed campaign_lifecycle_artifacts',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'brand_strategist' },
    },
    {
      step_id: 'brand_strategist',
      step_type: 'action',
      agent_id: 'brand-strategist',
      description: 'Brand foundations · voice + positioning + palette seeds',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'market_research_analyst' },
    },
    {
      step_id: 'market_research_analyst',
      step_type: 'action',
      agent_id: 'market-research-analyst',
      description: 'Competitive landscape + ICP + GTM opportunities',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'creative_director' },
    },
    {
      step_id: 'creative_director',
      step_type: 'action',
      agent_id: 'creative-director',
      description:
        'Visual system · palette · typography · brand voice tone of voice',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'parallel_assets' },
    },
    {
      step_id: 'parallel_assets',
      step_type: 'fork',
      description:
        'Web design + marketing content creation in parallel · both feed editor-en-jefe',
      branches: ['web_designer', 'marketing_content_creator'],
      join_at: 'join_assets',
    },
    {
      step_id: 'web_designer',
      step_type: 'action',
      agent_id: 'web-designer',
      description: 'Landing page composition · sections + components',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_assets' },
    },
    {
      step_id: 'marketing_content_creator',
      step_type: 'action',
      agent_id: 'marketing-content-creator',
      description: 'Initial content pack · hero copy + social seeds + email',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'join_assets' },
    },
    {
      step_id: 'join_assets',
      step_type: 'join',
      waits_for: ['web_designer', 'marketing_content_creator'],
      next_step: { kind: 'static', step_id: 'editor_en_jefe_qa' },
    },
    {
      step_id: 'editor_en_jefe_qa',
      step_type: 'action',
      agent_id: 'editor-en-jefe',
      description:
        'Editor-en-jefe QA · runs Camino III auto-trigger internally · output gates the launch',
      retry_budget: {
        max_attempts: 2,
        initial_backoff_ms: 2000,
        max_backoff_ms: 30_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'camino_iii_launch_gate' },
    },
    {
      step_id: 'camino_iii_launch_gate',
      step_type: 'gate_camino_iii',
      description: 'Camino III panel vote · approve onboarding launch',
      gate_config: {
        timeout_ms: 7 * 24 * 60 * 60 * 1000, // 7 days per ADR-018 cap
        escalate_to: 'hitl',
        description:
          'Onboarding artifacts ready · Camino III panel votes approve | revise | reject',
      },
      next_step: { kind: 'static', step_id: 'launch_ready' },
      next_step_rejected: 'hitl_revise',
    },
    {
      step_id: 'hitl_revise',
      step_type: 'gate_hitl',
      description: 'HITL revise loop · human triages rejected QA',
      gate_config: {
        timeout_ms: null,
        description:
          'Camino III rejected · operator reviews + redirects to specific agent for revision',
      },
      next_step: { kind: 'static', step_id: 'editor_en_jefe_qa' },
    },
    {
      step_id: 'launch_ready',
      step_type: 'terminal_success',
      description: 'Onboarding artifacts ready to launch · transitions to ALWAYS_ON',
    },
  ],
  metadata: {
    source_workflow: 'RwUo7G2PmZNqyMbe',
    status: 'draft',
    notes:
      'Draft based on Master Nivel 1 ugK3 ONBOARD branch + Journey B Pipeline structure (CC#3 §3.2 + §10). Migrates Pattern A sync cascade (24 POST) to handoffs-via-log per Gap #4. Pending router build to actually dispatch.',
  },
}
