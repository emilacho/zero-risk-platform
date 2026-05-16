'use client'
/**
 * SparklineGrid · many-agent grid of sparkline tiles. Used as a quick
 * "overview" view to spot drift / outliers across the agency.
 */
import { SparklineAgentStats } from './SparklineAgentStats'
import { cn } from '../utils/cn'
import type { SparklinePoint } from '../types'

export interface SparklineGridProps {
  agents: Array<{
    slug: string
    label: string
    metric: string
    current: number
    delta: number
    series: SparklinePoint[]
  }>
  className?: string
}

export function SparklineGrid({ agents, className }: SparklineGridProps) {
  return (
    <div
      className={cn('spark-grid', className)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '0.75rem',
      }}
    >
      {agents.map((a) => (
        <SparklineAgentStats
          key={a.slug}
          label={a.label}
          metric={a.metric}
          current={a.current}
          delta={a.delta}
          series={a.series}
        />
      ))}
    </div>
  )
}
