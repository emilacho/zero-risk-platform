/**
 * Sample-data fixtures for the Mission Control dashboard components.
 *
 * These mimic the shape of the future backend queries against the
 * `agents`, `clients`, `agent_invocations`, and `workflow_runs` tables.
 * Replace with real Supabase fetches in the host app — the prop shapes
 * are stable contracts.
 */

import type {
  AgentInvocation,
  AgentSummary,
  ClientFolder,
  KpiSnapshot,
  MemoryGraphData,
  SparklinePoint,
  WorkflowSummary,
} from '../types'

// ── KPI cards (4 top-of-dashboard headline metrics) ─────────────────────
export const kpiSnapshotFixture: KpiSnapshot = {
  agentsActive: { value: 39, delta: 2, deltaLabel: '+2 vs last week' },
  clientsActive: { value: 4, delta: 1, deltaLabel: '+1 vs last week' },
  spendMonth: { value: 1247.83, delta: -8.3, deltaLabel: '-8.3% vs prev month' },
  workflowsActive: { value: 29, delta: 0, deltaLabel: 'no change' },
}

// ── Top-N agents by cost (BarListTopAgents) ─────────────────────────────
export const topAgentsByCostFixture: AgentSummary[] = [
  { slug: 'creative-director',           costUsd: 312.40, invocations: 142, model: 'opus-4-6',   trend: 'up' },
  { slug: 'content-creator',             costUsd: 198.65, invocations: 287, model: 'sonnet-4-6', trend: 'up' },
  { slug: 'competitive-intelligence-agent', costUsd: 156.22, invocations: 41, model: 'opus-4-6', trend: 'flat' },
  { slug: 'web-designer',                costUsd: 142.10, invocations: 88,  model: 'opus-4-6',   trend: 'up' },
  { slug: 'editor-en-jefe',              costUsd: 118.74, invocations: 410, model: 'sonnet-4-6', trend: 'flat' },
  { slug: 'brand-strategist',            costUsd: 96.55,  invocations: 158, model: 'opus-4-6',   trend: 'down' },
  { slug: 'jefe-client-success',         costUsd: 71.20,  invocations: 192, model: 'sonnet-4-6', trend: 'flat' },
  { slug: 'seo-specialist',              costUsd: 48.30,  invocations: 64,  model: 'sonnet-4-6', trend: 'up' },
]

// ── Cost timeline (LineChartCostTimeline) ───────────────────────────────
export const costTimelineFixture: Array<{ date: string; opus: number; sonnet: number; haiku: number }> = [
  { date: '2026-05-01', opus: 32.1, sonnet: 18.4, haiku: 0.8 },
  { date: '2026-05-02', opus: 28.7, sonnet: 21.2, haiku: 1.1 },
  { date: '2026-05-03', opus: 41.3, sonnet: 19.8, haiku: 0.9 },
  { date: '2026-05-04', opus: 38.9, sonnet: 25.5, haiku: 1.4 },
  { date: '2026-05-05', opus: 52.2, sonnet: 27.1, haiku: 1.6 },
  { date: '2026-05-06', opus: 46.4, sonnet: 22.9, haiku: 1.0 },
  { date: '2026-05-07', opus: 39.1, sonnet: 18.2, haiku: 0.7 },
  { date: '2026-05-08', opus: 44.5, sonnet: 23.0, haiku: 1.3 },
  { date: '2026-05-09', opus: 51.7, sonnet: 29.4, haiku: 1.5 },
  { date: '2026-05-10', opus: 48.2, sonnet: 26.1, haiku: 1.2 },
  { date: '2026-05-11', opus: 55.9, sonnet: 31.6, haiku: 1.8 },
  { date: '2026-05-12', opus: 49.3, sonnet: 24.8, haiku: 1.1 },
  { date: '2026-05-13', opus: 42.7, sonnet: 20.3, haiku: 0.9 },
  { date: '2026-05-14', opus: 37.4, sonnet: 17.5, haiku: 0.6 },
  { date: '2026-05-15', opus: 44.8, sonnet: 21.9, haiku: 1.0 },
  { date: '2026-05-16', opus: 47.1, sonnet: 23.2, haiku: 1.2 },
]

// ── Recent agent invocations (ActivityFeed) ─────────────────────────────
const baseTime = new Date('2026-05-16T13:30:00Z').getTime()
export const agentInvocationFixture: AgentInvocation[] = [
  { id: 'inv-101', agent: 'style-consistency-reviewer', clientId: 'd69100b5', status: 'success',  durationMs: 4218, costUsd: 0.41, at: new Date(baseTime - 1000 * 32).toISOString(),   task: 'cross-output coherence audit · 5-output cascade' },
  { id: 'inv-100', agent: 'delivery-coordinator',       clientId: 'd69100b5', status: 'success',  durationMs: 3120, costUsd: 0.35, at: new Date(baseTime - 1000 * 89).toISOString(),   task: '7-check shippability audit · cascade naufrago-v1' },
  { id: 'inv-099', agent: 'jefe-client-success',        clientId: 'd69100b5', status: 'success',  durationMs: 5840, costUsd: 0.08, at: new Date(baseTime - 1000 * 180).toISOString(),  task: 'Camino III · client-success-lens review · ad-meta-primary' },
  { id: 'inv-098', agent: 'brand-strategist',           clientId: 'd69100b5', status: 'escalated', durationMs: 7210, costUsd: 0.42, at: new Date(baseTime - 1000 * 244).toISOString(),  task: 'Camino III · brand-lens review · landing-hero' },
  { id: 'inv-097', agent: 'editor-en-jefe',             clientId: 'd69100b5', status: 'success',  durationMs: 3400, costUsd: 0.05, at: new Date(baseTime - 1000 * 301).toISOString(),  task: 'Camino III · editor review · blog draft v3' },
  { id: 'inv-096', agent: 'creative-director',          clientId: 'd69100b5', status: 'success',  durationMs: 9810, costUsd: 0.62, at: new Date(baseTime - 1000 * 612).toISOString(),  task: 'creative direction · 4 image prompts · hero + 3 supports' },
  { id: 'inv-095', agent: 'content-creator',            clientId: 'd69100b5', status: 'revision',  durationMs: 6440, costUsd: 0.18, at: new Date(baseTime - 1000 * 880).toISOString(),  task: 'blog v3 · revision after editor flag' },
  { id: 'inv-094', agent: 'web-designer',               clientId: 'd69100b5', status: 'success',  durationMs: 11200, costUsd: 0.71, at: new Date(baseTime - 1000 * 1260).toISOString(), task: 'section architecture · 6-section landing spec' },
  { id: 'inv-093', agent: 'competitive-intelligence-agent', clientId: 'd69100b5', status: 'success', durationMs: 18420, costUsd: 1.24, at: new Date(baseTime - 1000 * 2010).toISOString(), task: '5-layer deep scan · 3 competitors · synthesis' },
  { id: 'inv-092', agent: 'campaign-brief-agent',       clientId: 'd69100b5', status: 'success',  durationMs: 4180, costUsd: 0.09, at: new Date(baseTime - 1000 * 3140).toISOString(),  task: 'campaign brief · Q2 launch' },
]

// ── Per-agent sparkline series (SparklineAgentStats / SparklineGrid) ───
function makeSpark(seed: number, n = 24): SparklinePoint[] {
  // Deterministic pseudo-random walk so the showcase renders identically run-to-run.
  let prev = 50 + (seed % 30)
  const out: SparklinePoint[] = []
  for (let i = 0; i < n; i++) {
    const step = ((seed * (i + 7)) % 17) - 8
    prev = Math.max(8, Math.min(100, prev + step))
    out.push({ x: i, y: prev })
  }
  return out
}

export const agentSparklineFixture: Array<{ slug: string; label: string; metric: string; current: number; delta: number; series: SparklinePoint[] }> = [
  { slug: 'creative-director',           label: 'Creative Director',     metric: 'invocations / day',  current: 18, delta:  12.4, series: makeSpark(3) },
  { slug: 'content-creator',             label: 'Content Creator',       metric: 'invocations / day',  current: 41, delta:   5.1, series: makeSpark(7) },
  { slug: 'editor-en-jefe',              label: 'Editor en Jefe',        metric: 'invocations / day',  current: 62, delta:  -2.8, series: makeSpark(11) },
  { slug: 'competitive-intelligence-agent', label: 'CI Agent',           metric: 'invocations / day',  current:  9, delta:  21.0, series: makeSpark(13) },
  { slug: 'brand-strategist',            label: 'Brand Strategist',      metric: 'invocations / day',  current: 22, delta:  -4.2, series: makeSpark(17) },
  { slug: 'web-designer',                label: 'Web Designer',          metric: 'invocations / day',  current: 13, delta:   8.6, series: makeSpark(19) },
]

// ── Cliente folder cards (ClienteCarpetaCard) ──────────────────────────
export const clienteCarpetaFixture: ClientFolder[] = [
  {
    clientId: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
    name: 'Náufrago',
    industry: 'Seguridad industrial · Ecuador',
    status: 'active',
    spendMonth: 412.34,
    invocations30d: 287,
    workflowsActive: 4,
    lastActivity: new Date(baseTime - 1000 * 32).toISOString(),
    cascadesShipped: 3,
    healthScore: 87,
  },
  {
    clientId: 'a12c3d4e-…',
    name: 'Cliente Demo 2',
    industry: 'SaaS · LATAM',
    status: 'onboarding',
    spendMonth: 18.40,
    invocations30d: 12,
    workflowsActive: 1,
    lastActivity: new Date(baseTime - 1000 * 60 * 60 * 4).toISOString(),
    cascadesShipped: 0,
    healthScore: 62,
  },
  {
    clientId: 'b89f5g6h-…',
    name: 'Cliente Demo 3',
    industry: 'E-commerce · México',
    status: 'paused',
    spendMonth: 0,
    invocations30d: 4,
    workflowsActive: 0,
    lastActivity: new Date(baseTime - 1000 * 60 * 60 * 24 * 12).toISOString(),
    cascadesShipped: 1,
    healthScore: 38,
  },
]

// ── Workflow summaries (CubiculoCard cross-references this) ────────────
export const workflowSummaryFixture: WorkflowSummary[] = [
  { id: 'wf-101', name: 'Onboarding E2E v2', clientId: 'd69100b5', status: 'active',   lastRun: new Date(baseTime - 1000 * 60 * 12).toISOString(),  successRate24h: 100 },
  { id: 'wf-072', name: 'NEXUS Master Journey', clientId: 'd69100b5', status: 'active',   lastRun: new Date(baseTime - 1000 * 60 * 38).toISOString(), successRate24h: 96 },
  { id: 'wf-098', name: 'Competitive Intel Deep Scan', clientId: 'd69100b5', status: 'active', lastRun: new Date(baseTime - 1000 * 60 * 60 * 2).toISOString(), successRate24h: 88 },
  { id: 'wf-044', name: 'Daily Cost Rollup',    clientId: null,       status: 'active',   lastRun: new Date(baseTime - 1000 * 60 * 60).toISOString(),   successRate24h: 100 },
]

// ── Agent cubículo detail (CubiculoCard fixture · representative agent) ─
export const cubiculoFixture = {
  slug: 'style-consistency-reviewer',
  displayName: 'Style Consistency Reviewer',
  role: 'empleado',
  model: 'claude-opus-4-6',
  status: 'active' as const,
  description: 'Post-Camino-III cross-output coherence auditor.',
  metrics: {
    invocations30d: 42,
    costUsd30d: 18.42,
    avgDurationMs: 4218,
    successRate: 100,
  },
  skills: ['cross-output-audit', 'voice-fidelity', 'cascade-lexicon'],
  recentInvocations: agentInvocationFixture.slice(0, 3),
}

// ── Memory graph (ReactFlow) ───────────────────────────────────────────
export const memoryGraphFixture: MemoryGraphData = {
  nodes: [
    // Cliente central
    { id: 'client-naufrago', kind: 'client',   label: 'Náufrago',                meta: { industry: 'Seguridad industrial · Ecuador', healthScore: 87 } },

    // Agentes conectados al cliente
    { id: 'agent-creative-director', kind: 'agent', label: 'Creative Director',  meta: { model: 'opus-4-6',   role: 'empleado' } },
    { id: 'agent-content-creator',   kind: 'agent', label: 'Content Creator',    meta: { model: 'sonnet-4-6', role: 'empleado' } },
    { id: 'agent-editor-en-jefe',    kind: 'agent', label: 'Editor en Jefe',     meta: { model: 'sonnet-4-6', role: 'reviewer' } },
    { id: 'agent-brand-strategist',  kind: 'agent', label: 'Brand Strategist',   meta: { model: 'opus-4-6',   role: 'reviewer' } },
    { id: 'agent-style-consistency', kind: 'agent', label: 'Style Consistency',  meta: { model: 'opus-4-6',   role: 'reviewer · NEW' } },
    { id: 'agent-delivery-coord',    kind: 'agent', label: 'Delivery Coordinator', meta: { model: 'opus-4-6', role: 'gate · NEW' } },

    // Workflows
    { id: 'wf-master-journey', kind: 'workflow', label: 'NEXUS Master Journey', meta: { runs24h: 18 } },
    { id: 'wf-deep-scan',      kind: 'workflow', label: 'Deep Scan 5-Layer',     meta: { runs24h: 4 } },

    // Tools / external integrations
    { id: 'tool-supabase',  kind: 'tool', label: 'Supabase',  meta: { surface: 'DB · Storage · Auth' } },
    { id: 'tool-anthropic', kind: 'tool', label: 'Anthropic', meta: { surface: 'Managed Agents · Sonnet · Opus' } },
    { id: 'tool-ghl',       kind: 'tool', label: 'GoHighLevel', meta: { surface: 'CRM · WhatsApp · Email' } },
  ],
  edges: [
    // Cliente → agents (uses)
    { id: 'e1',  source: 'client-naufrago', target: 'agent-creative-director', label: 'invokes' },
    { id: 'e2',  source: 'client-naufrago', target: 'agent-content-creator',   label: 'invokes' },
    { id: 'e3',  source: 'client-naufrago', target: 'agent-brand-strategist',  label: 'invokes' },

    // Producers → reviewers (cascade flow)
    { id: 'e4',  source: 'agent-content-creator',   target: 'agent-editor-en-jefe',    label: 'review' },
    { id: 'e5',  source: 'agent-content-creator',   target: 'agent-brand-strategist',  label: 'review' },
    { id: 'e6',  source: 'agent-creative-director', target: 'agent-editor-en-jefe',    label: 'review' },
    { id: 'e7',  source: 'agent-editor-en-jefe',    target: 'agent-style-consistency', label: 'next' },
    { id: 'e8',  source: 'agent-brand-strategist',  target: 'agent-style-consistency', label: 'next' },
    { id: 'e9',  source: 'agent-style-consistency', target: 'agent-delivery-coord',    label: 'next' },

    // Workflows orchestrate agents
    { id: 'e10', source: 'wf-master-journey', target: 'agent-content-creator',   label: 'step' },
    { id: 'e11', source: 'wf-master-journey', target: 'agent-creative-director', label: 'step' },
    { id: 'e12', source: 'wf-deep-scan',      target: 'agent-brand-strategist',  label: 'step' },

    // Agents → tools
    { id: 'e13', source: 'agent-content-creator',   target: 'tool-anthropic', label: 'uses' },
    { id: 'e14', source: 'agent-creative-director', target: 'tool-anthropic', label: 'uses' },
    { id: 'e15', source: 'agent-delivery-coord',    target: 'tool-supabase',  label: 'reads' },
    { id: 'e16', source: 'client-naufrago',         target: 'tool-ghl',       label: 'CRM' },
  ],
}
