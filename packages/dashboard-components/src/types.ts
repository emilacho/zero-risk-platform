/**
 * Shared types · public contracts the dashboard host fills with real data.
 *
 * Every component in this package accepts props shaped per these types.
 * The fixtures in `src/fixtures/` are concrete examples; backend wiring
 * just swaps the source.
 */

// ── KPI cards ──────────────────────────────────────────────────────────
export interface KpiMetric {
  /** Current absolute value. */
  value: number
  /** Delta vs previous period · positive = improvement (depends on metric). */
  delta: number
  /** Human-friendly label for the delta (e.g., "+2 vs last week"). */
  deltaLabel: string
  /** Optional inline sparkline series. */
  sparkline?: SparklinePoint[]
}

export interface KpiSnapshot {
  agentsActive: KpiMetric
  clientsActive: KpiMetric
  spendMonth: KpiMetric
  workflowsActive: KpiMetric
}

// ── Agent summary (BarListTopAgents · SparklineGrid) ───────────────────
export type AgentTrend = 'up' | 'down' | 'flat'
export interface AgentSummary {
  slug: string
  costUsd: number
  invocations: number
  model: string
  trend: AgentTrend
}

// ── Sparkline point ────────────────────────────────────────────────────
export interface SparklinePoint {
  x: number
  y: number
}

// ── Agent invocation (ActivityFeed) ────────────────────────────────────
export type InvocationStatus = 'success' | 'failure' | 'escalated' | 'revision' | 'running'
export interface AgentInvocation {
  id: string
  agent: string
  clientId: string | null
  status: InvocationStatus
  durationMs: number
  costUsd: number
  /** ISO timestamp. */
  at: string
  task: string
}

// ── Client folder (ClienteCarpetaCard) ─────────────────────────────────
export type ClientStatus = 'active' | 'onboarding' | 'paused' | 'churned'
export interface ClientFolder {
  clientId: string
  name: string
  industry: string
  status: ClientStatus
  spendMonth: number
  invocations30d: number
  workflowsActive: number
  /** ISO timestamp · most recent agent_invocation OR workflow_run. */
  lastActivity: string
  cascadesShipped: number
  /** 0-100 · derived from successRate · spend velocity · review escalations. */
  healthScore: number
}

// ── Workflow summary (CubiculoCard cross-reference) ────────────────────
export type WorkflowStatus = 'active' | 'inactive' | 'errored'
export interface WorkflowSummary {
  id: string
  name: string
  clientId: string | null
  status: WorkflowStatus
  lastRun: string
  successRate24h: number
}

// ── Memory graph (ReactFlow) ───────────────────────────────────────────
export type MemoryNodeKind = 'client' | 'agent' | 'workflow' | 'tool'

export interface MemoryNodeMeta {
  industry?: string
  healthScore?: number
  model?: string
  role?: string
  surface?: string
  runs24h?: number
}

/**
 * Intersected with `Record<string, unknown>` so it satisfies the
 * `@xyflow/react` v12 `Node<TData>` constraint without forcing the
 * graph data to be loose at the call site. Consumers still get
 * autocomplete for `id` / `kind` / `label` / `meta`.
 */
export type MemoryNodeData = {
  id: string
  kind: MemoryNodeKind
  label: string
  meta?: MemoryNodeMeta
} & Record<string, unknown>

export interface MemoryEdgeData {
  id: string
  source: string
  target: string
  label?: string
}

export interface MemoryGraphData {
  nodes: MemoryNodeData[]
  edges: MemoryEdgeData[]
}
