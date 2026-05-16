'use client'
/**
 * KpiCard · atomic single-metric card.
 *
 * Tremor-style: small label · large digit · delta % · optional inline
 * sparkline. The KpiGrid wires 4 of these together for the dashboard hero.
 *
 * Props are designed to map 1:1 with KpiMetric · the host passes a fixture
 * or a real Supabase aggregate.
 */
import { ReactNode } from 'react'
import { theme } from '../theme'
import { cn } from '../utils/cn'
import { formatCurrency, formatNumber, formatPercent } from '../utils/format'
import { Sparkline } from './Sparkline'
import type { KpiMetric } from '../types'

export interface KpiCardProps {
  label: string
  /** Optional icon element rendered above the label · usually a Lucide-style 16-20px svg. */
  icon?: ReactNode
  metric: KpiMetric
  /** How to format the value. */
  format?: 'number' | 'currency' | 'percent'
  /** Higher delta = better (true · default) or worse (false · e.g., spend, latency). */
  deltaIsGood?: boolean
  /** Render an inline sparkline strip when `metric.sparkline` is provided. */
  showSparkline?: boolean
  className?: string
}

export function KpiCard({
  label,
  icon,
  metric,
  format = 'number',
  deltaIsGood = true,
  showSparkline = true,
  className,
}: KpiCardProps) {
  const value =
    format === 'currency' ? formatCurrency(metric.value, { compact: true })
    : format === 'percent' ? formatPercent(metric.value)
    : formatNumber(metric.value, { compact: true })

  const deltaPositive = metric.delta > 0
  const deltaNeutral = metric.delta === 0
  const deltaGood = deltaNeutral ? null : (deltaPositive ? deltaIsGood : !deltaIsGood)
  const deltaColor = deltaGood === null
    ? theme.colors.fg.muted
    : deltaGood
    ? theme.colors.success
    : theme.colors.danger

  return (
    <div
      className={cn('kpi-card group relative overflow-hidden', className)}
      style={{
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radius.lg,
        padding: '1.25rem',
        transition: `background ${theme.motion.base}, border-color ${theme.motion.base}`,
      }}
    >
      {/* Hover violet glow accent · subtle */}
      <div
        aria-hidden
        className="kpi-glow"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(800px 200px at 0% 0%, ${theme.colors.primary[500]}11, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {icon ? (
          <span style={{ color: theme.colors.primary[400], display: 'inline-flex', alignItems: 'center' }}>
            {icon}
          </span>
        ) : null}
        <span style={{ color: theme.colors.fg.secondary, fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <span
          style={{
            color: theme.colors.fg.primary,
            fontSize: 32,
            fontWeight: 600,
            fontFamily: theme.font.sans,
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>

        {showSparkline && metric.sparkline?.length ? (
          <Sparkline points={metric.sparkline} width={84} height={28} stroke={theme.colors.primary[400]} />
        ) : null}
      </div>

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span
          style={{
            color: deltaColor,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {deltaNeutral ? '·' : formatPercent(metric.delta, { signed: true })}
        </span>
        <span style={{ color: theme.colors.fg.muted }}>{metric.deltaLabel}</span>
      </div>
    </div>
  )
}
