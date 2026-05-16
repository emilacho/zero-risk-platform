'use client'
/**
 * LineChartCostTimeline · stacked area + line chart over a date-keyed
 * cost-by-tier series (opus / sonnet / haiku).
 *
 * Uses Recharts so resizing / tooltips / legends come for free. The
 * styling is hand-tuned to match the dark theme + violet/cyan palette.
 */
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { theme } from '../theme'
import { cn } from '../utils/cn'
import { formatCurrency } from '../utils/format'

export interface LineChartCostTimelineProps {
  /** Series · one row per day · keys correspond to model tiers. */
  data: Array<{ date: string; opus: number; sonnet: number; haiku: number }>
  title?: string
  className?: string
  height?: number
}

export function LineChartCostTimeline({
  data,
  title = 'Costo diario · últimos 16 días',
  className,
  height = 260,
}: LineChartCostTimelineProps) {
  const total = data.reduce((acc, d) => acc + d.opus + d.sonnet + d.haiku, 0)
  const peak = data.reduce((acc, d) => Math.max(acc, d.opus + d.sonnet + d.haiku), 0)

  return (
    <div
      className={cn('line-chart', className)}
      style={{
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radius.lg,
        padding: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ color: theme.colors.fg.primary, fontSize: 14, fontWeight: 600 }}>{title}</div>
          <div style={{ marginTop: 4, color: theme.colors.fg.muted, fontSize: 12 }}>
            Total {formatCurrency(total)} · pico diario {formatCurrency(peak)}
          </div>
        </div>
        <Legend
          payload={[
            { value: 'Opus', color: theme.colors.primary[500], type: 'square', id: 'opus' },
            { value: 'Sonnet', color: theme.colors.accent[500], type: 'square', id: 'sonnet' },
            { value: 'Haiku', color: theme.colors.success, type: 'square', id: 'haiku' },
          ]}
          wrapperStyle={{ position: 'static', display: 'inline-flex', gap: 12, fontSize: 12 }}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="opus-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.primary[500]} stopOpacity={0.55} />
              <stop offset="95%" stopColor={theme.colors.primary[500]} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="sonnet-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.accent[500]} stopOpacity={0.55} />
              <stop offset="95%" stopColor={theme.colors.accent[500]} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="haiku-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.success} stopOpacity={0.4} />
              <stop offset="95%" stopColor={theme.colors.success} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chart.gridStroke} />
          <XAxis
            dataKey="date"
            tick={{ fill: theme.colors.fg.muted, fontSize: 11 }}
            tickFormatter={(d: string) => d.slice(5)}
            stroke={theme.chart.axisStroke}
          />
          <YAxis
            tick={{ fill: theme.colors.fg.muted, fontSize: 11 }}
            stroke={theme.chart.axisStroke}
            tickFormatter={(v) => `$${v}`}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: theme.chart.tooltipBg,
              border: `1px solid ${theme.chart.tooltipBorder}`,
              borderRadius: theme.radius.md,
              color: theme.colors.fg.primary,
              fontSize: 12,
            }}
            labelStyle={{ color: theme.colors.fg.secondary, marginBottom: 4 }}
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <Area type="monotone" dataKey="opus"   stackId="1" stroke={theme.colors.primary[500]} fill="url(#opus-fill)"   strokeWidth={1.5} />
          <Area type="monotone" dataKey="sonnet" stackId="1" stroke={theme.colors.accent[500]}  fill="url(#sonnet-fill)" strokeWidth={1.5} />
          <Area type="monotone" dataKey="haiku"  stackId="1" stroke={theme.colors.success}      fill="url(#haiku-fill)"  strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
