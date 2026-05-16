'use client'
/**
 * SparklineAgentStats · single-agent micro-card · big number + sparkline.
 *
 * Use for inline stat sticks on an agent detail page or anywhere a single
 * agent needs a compact metric tile.
 */
import { theme } from '../theme'
import { cn } from '../utils/cn'
import { formatPercent } from '../utils/format'
import { Sparkline } from './Sparkline'
import type { SparklinePoint } from '../types'

export interface SparklineAgentStatsProps {
  label: string
  metric: string
  current: number
  /** Period delta in %. */
  delta: number
  series: SparklinePoint[]
  /** Higher value = better (default true · for invocations). Set false for latency, cost, etc. */
  deltaIsGood?: boolean
  className?: string
}

export function SparklineAgentStats({
  label,
  metric,
  current,
  delta,
  series,
  deltaIsGood = true,
  className,
}: SparklineAgentStatsProps) {
  const deltaPositive = delta > 0
  const deltaNeutral = Math.abs(delta) < 0.1
  const deltaGood = deltaNeutral ? null : (deltaPositive === deltaIsGood)
  const accent = deltaGood === null
    ? theme.colors.fg.muted
    : deltaGood
    ? theme.colors.success
    : theme.colors.danger

  return (
    <div
      className={cn('spark-stat', className)}
      style={{
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radius.lg,
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 160,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: theme.colors.fg.secondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ color: accent, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {deltaNeutral ? '·' : formatPercent(delta, { signed: true })}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: theme.colors.fg.primary, fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {current.toLocaleString()}
          </span>
          <span style={{ color: theme.colors.fg.muted, fontSize: 11, marginTop: 2 }}>{metric}</span>
        </div>
        <Sparkline
          points={series}
          width={84}
          height={32}
          stroke={deltaGood === false ? theme.colors.danger : theme.colors.accent[500]}
        />
      </div>
    </div>
  )
}
