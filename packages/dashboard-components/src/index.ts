/**
 * @zero-risk/dashboard-components
 *
 * Public entry · the dashboard host imports from here.
 *   import { KpiGrid, MemoryGraph, theme, ... } from '@zero-risk/dashboard-components'
 */

// ── Theme ──────────────────────────────────────────────────────────────
export { theme, themeCssVars } from './theme'
export type { Theme } from './theme'

// ── Types ──────────────────────────────────────────────────────────────
export type {
  AgentInvocation,
  AgentSummary,
  AgentTrend,
  ClientFolder,
  ClientStatus,
  InvocationStatus,
  KpiMetric,
  KpiSnapshot,
  MemoryEdgeData,
  MemoryGraphData,
  MemoryNodeData,
  MemoryNodeKind,
  MemoryNodeMeta,
  SparklinePoint,
  WorkflowStatus,
  WorkflowSummary,
} from './types'

// ── Tremor-style components (10) ───────────────────────────────────────
export { KpiCard } from './components/KpiCard'
export type { KpiCardProps } from './components/KpiCard'
export { KpiGrid } from './components/KpiGrid'
export type { KpiGridProps } from './components/KpiGrid'
export { BarListTopAgents } from './components/BarListTopAgents'
export type { BarListTopAgentsProps } from './components/BarListTopAgents'
export { LineChartCostTimeline } from './components/LineChartCostTimeline'
export type { LineChartCostTimelineProps } from './components/LineChartCostTimeline'
export { ActivityFeed } from './components/ActivityFeed'
export type { ActivityFeedProps } from './components/ActivityFeed'
export { SparklineAgentStats } from './components/SparklineAgentStats'
export type { SparklineAgentStatsProps } from './components/SparklineAgentStats'
export { SparklineGrid } from './components/SparklineGrid'
export type { SparklineGridProps } from './components/SparklineGrid'
export { Sparkline } from './components/Sparkline'
export type { SparklineProps } from './components/Sparkline'
export { BentoGrid } from './components/BentoGrid'
export type { BentoGridProps, BentoCellProps } from './components/BentoGrid'
export { CubiculoCard } from './components/CubiculoCard'
export type { CubiculoCardProps } from './components/CubiculoCard'
export { ClienteCarpetaCard } from './components/ClienteCarpetaCard'
export type { ClienteCarpetaCardProps } from './components/ClienteCarpetaCard'

// ── Memory graph (11 · 12) ─────────────────────────────────────────────
export { MemoryGraph, memoryNodeTypes, ClientNode, AgentNode, WorkflowNode, ToolNode } from './memory-graph'
export type { MemoryGraphProps } from './memory-graph'

// ── Utils ──────────────────────────────────────────────────────────────
export { formatCurrency, formatNumber, formatPercent, formatRelativeTime, clamp } from './utils/format'
export { cn } from './utils/cn'
