'use client'
/**
 * BarListTopAgents · horizontal bar list ranking the top N agents by cost.
 *
 * Tremor-style: each row has a left label, a proportional bar, and a right
 * value. Trend icon trails the agent name to hint movement.
 */
import { theme } from '../theme'
import { cn } from '../utils/cn'
import { formatCurrency } from '../utils/format'
import type { AgentSummary } from '../types'

export interface BarListTopAgentsProps {
  agents: AgentSummary[]
  /** Show at most N rows · the rest are aggregated into "+N more". */
  limit?: number
  /** Optional title rendered above the list. */
  title?: string
  className?: string
}

export function BarListTopAgents({
  agents,
  limit = 8,
  title = 'Top agentes por costo',
  className,
}: BarListTopAgentsProps) {
  const sorted = [...agents].sort((a, b) => b.costUsd - a.costUsd)
  const shown = sorted.slice(0, limit)
  const hidden = sorted.length - shown.length
  const max = shown[0]?.costUsd ?? 1
  return (
    <div
      className={cn('bar-list', className)}
      style={{
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radius.lg,
        padding: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: theme.colors.fg.primary, fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ color: theme.colors.fg.muted, fontSize: 12 }}>USD · últimos 30 días</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map((a, i) => {
          const pct = (a.costUsd / max) * 100
          return (
            <li key={a.slug} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: theme.colors.fg.primary, fontWeight: 500, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: theme.colors.fg.muted, fontVariantNumeric: 'tabular-nums', width: 16, display: 'inline-block' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <code style={{ color: theme.colors.fg.primary, fontFamily: theme.font.mono, fontSize: 12 }}>{a.slug}</code>
                  <TrendIcon trend={a.trend} />
                  <span style={{ color: theme.colors.fg.muted }}>· {a.model}</span>
                </span>
                <span style={{ color: theme.colors.fg.primary, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(a.costUsd)}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: theme.radius.full,
                  background: theme.colors.bg.surfaceActive,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${theme.colors.primary[500]}, ${theme.colors.accent[500]})`,
                    transition: `width ${theme.motion.slow} ease`,
                  }}
                />
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: theme.colors.fg.muted, fontVariantNumeric: 'tabular-nums' }}>
                {a.invocations.toLocaleString()} invocaciones
              </div>
            </li>
          )
        })}
        {hidden > 0 ? (
          <li style={{ fontSize: 11, color: theme.colors.fg.muted, paddingTop: 4 }}>
            + {hidden} agentes más
          </li>
        ) : null}
      </ul>
    </div>
  )
}

function TrendIcon({ trend }: { trend: AgentSummary['trend'] }) {
  if (trend === 'up') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-label="up" style={{ color: theme.colors.success }}>
        <path d="M1 7l3-3 2 2 3-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (trend === 'down') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-label="down" style={{ color: theme.colors.danger }}>
        <path d="M1 3l3 3 2-2 3 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-label="flat" style={{ color: theme.colors.fg.muted }}>
      <path d="M1 5h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}
