'use client'
/**
 * ActivityFeed · time-ordered stream of recent agent_invocations rows.
 *
 * One row per invocation · status pill · relative time · duration · cost ·
 * task snippet. Clicking a row is left to the host (pass `onRowClick`).
 */
import { theme } from '../theme'
import { cn } from '../utils/cn'
import { formatCurrency, formatRelativeTime } from '../utils/format'
import type { AgentInvocation, InvocationStatus } from '../types'

export interface ActivityFeedProps {
  invocations: AgentInvocation[]
  title?: string
  /** Cap rendered rows · the rest stays available via scroll. */
  limit?: number
  onRowClick?: (inv: AgentInvocation) => void
  className?: string
}

const STATUS_STYLE: Record<InvocationStatus, { bg: string; fg: string; label: string }> = {
  success:   { bg: 'rgba(16,185,129,0.15)', fg: '#34d399', label: 'success' },
  failure:   { bg: 'rgba(239,68,68,0.18)',  fg: '#fca5a5', label: 'fail' },
  escalated: { bg: 'rgba(245,158,11,0.18)', fg: '#fbbf24', label: 'escalated' },
  revision:  { bg: 'rgba(124,58,237,0.18)', fg: '#c4b5fd', label: 'revision' },
  running:   { bg: 'rgba(6,182,212,0.18)',  fg: '#67e8f9', label: 'running' },
}

export function ActivityFeed({
  invocations,
  title = 'Actividad reciente',
  limit = 12,
  onRowClick,
  className,
}: ActivityFeedProps) {
  const rows = invocations.slice(0, limit)
  return (
    <div
      className={cn('activity-feed', className)}
      style={{
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radius.lg,
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: theme.colors.fg.primary, fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ color: theme.colors.fg.muted, fontSize: 12 }}>
          {invocations.length} eventos
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {rows.map((inv, idx) => {
          const s = STATUS_STYLE[inv.status]
          const interactive = !!onRowClick
          return (
            <li
              key={inv.id}
              onClick={interactive ? () => onRowClick!(inv) : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: '14px minmax(0, 1fr) auto',
                gap: 12,
                padding: '10px 0',
                borderTop: idx === 0 ? 'none' : `1px solid ${theme.colors.border.subtle}`,
                cursor: interactive ? 'pointer' : 'default',
              }}
            >
              {/* Status dot */}
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  marginTop: 6,
                  borderRadius: theme.radius.full,
                  background: s.fg,
                  boxShadow: `0 0 0 3px ${s.bg}`,
                }}
              />
              {/* Middle column */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <code
                    style={{
                      fontFamily: theme.font.mono,
                      fontSize: 12,
                      color: theme.colors.fg.primary,
                    }}
                  >
                    {inv.agent}
                  </code>
                  <span
                    style={{
                      background: s.bg,
                      color: s.fg,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: theme.radius.sm,
                    }}
                  >
                    {s.label}
                  </span>
                  {inv.clientId ? (
                    <span style={{ fontSize: 11, color: theme.colors.fg.muted }}>
                      · client {inv.clientId.slice(0, 8)}
                    </span>
                  ) : null}
                </div>
                <span
                  style={{
                    color: theme.colors.fg.secondary,
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 2,
                  }}
                >
                  {inv.task}
                </span>
              </div>
              {/* Right column · time + meta */}
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: theme.colors.fg.primary, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                  {formatRelativeTime(inv.at)}
                </span>
                <span style={{ color: theme.colors.fg.muted, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                  {(inv.durationMs / 1000).toFixed(1)}s · {formatCurrency(inv.costUsd)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
