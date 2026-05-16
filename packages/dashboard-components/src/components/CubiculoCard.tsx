'use client'
/**
 * CubiculoCard · "cubículo del agente" · collapsed agent detail card.
 *
 * Inspired by an open-office cubicle as a metaphor for an agent's small
 * personal workspace: identity at the top, KPIs in the middle, recent
 * activity in the footer. Click to expand into a full agent detail page
 * (host wires `onOpen`).
 */
import { theme } from '../theme'
import { cn } from '../utils/cn'
import { formatCurrency, formatRelativeTime } from '../utils/format'
import type { AgentInvocation } from '../types'

export interface CubiculoCardProps {
  slug: string
  displayName: string
  role: string
  model: string
  status: 'active' | 'paused' | 'deprecated'
  description?: string
  metrics: {
    invocations30d: number
    costUsd30d: number
    avgDurationMs: number
    /** 0-100. */
    successRate: number
  }
  skills?: string[]
  recentInvocations?: AgentInvocation[]
  onOpen?: () => void
  className?: string
}

export function CubiculoCard({
  slug,
  displayName,
  role,
  model,
  status,
  description,
  metrics,
  skills = [],
  recentInvocations = [],
  onOpen,
  className,
}: CubiculoCardProps) {
  const interactive = !!onOpen
  const statusColor =
    status === 'active' ? theme.colors.success : status === 'paused' ? theme.colors.warning : theme.colors.fg.muted

  return (
    <div
      className={cn('cubiculo', className)}
      onClick={onOpen}
      style={{
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radius.lg,
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        cursor: interactive ? 'pointer' : 'default',
        transition: `transform ${theme.motion.fast}, border-color ${theme.motion.fast}, box-shadow ${theme.motion.fast}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top-edge violet accent · 2px */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 2,
          background: `linear-gradient(90deg, ${theme.colors.primary[500]}, ${theme.colors.accent[500]})`,
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: theme.radius.full,
                background: statusColor,
                boxShadow: `0 0 8px ${statusColor}`,
              }}
              aria-label={`status ${status}`}
            />
            <span style={{ color: theme.colors.fg.primary, fontSize: 15, fontWeight: 600 }}>{displayName}</span>
          </div>
          <code style={{ color: theme.colors.fg.muted, fontFamily: theme.font.mono, fontSize: 11 }}>{slug}</code>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ color: theme.colors.fg.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {role}
          </span>
          <span
            style={{
              background: theme.colors.bg.surfaceActive,
              color: theme.colors.fg.secondary,
              borderRadius: theme.radius.sm,
              padding: '2px 6px',
              fontFamily: theme.font.mono,
              fontSize: 10,
            }}
          >
            {model}
          </span>
        </div>
      </div>

      {/* Description */}
      {description ? (
        <p style={{ color: theme.colors.fg.secondary, fontSize: 12, lineHeight: 1.5, margin: 0 }}>{description}</p>
      ) : null}

      {/* Metrics row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
          padding: '10px 0',
          borderTop: `1px solid ${theme.colors.border.subtle}`,
          borderBottom: `1px solid ${theme.colors.border.subtle}`,
        }}
      >
        <Stat label="invocaciones 30d" value={metrics.invocations30d.toLocaleString()} />
        <Stat label="costo 30d" value={formatCurrency(metrics.costUsd30d)} />
        <Stat label="latencia avg" value={`${(metrics.avgDurationMs / 1000).toFixed(1)}s`} />
        <Stat label="success rate" value={`${metrics.successRate.toFixed(0)}%`} />
      </div>

      {/* Skills · chips */}
      {skills.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {skills.slice(0, 4).map((s) => (
            <span
              key={s}
              style={{
                background: theme.colors.bg.surfaceActive,
                color: theme.colors.accent[400],
                fontSize: 10,
                fontFamily: theme.font.mono,
                padding: '2px 6px',
                borderRadius: theme.radius.sm,
              }}
            >
              {s}
            </span>
          ))}
          {skills.length > 4 ? (
            <span style={{ color: theme.colors.fg.muted, fontSize: 10, alignSelf: 'center' }}>
              + {skills.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Recent invocations · 2 lines max */}
      {recentInvocations.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {recentInvocations.slice(0, 2).map((inv) => (
            <div
              key={inv.id}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 8 }}
            >
              <span
                style={{
                  color: theme.colors.fg.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {inv.task}
              </span>
              <span style={{ color: theme.colors.fg.muted, fontVariantNumeric: 'tabular-nums' }}>
                {formatRelativeTime(inv.at)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: theme.colors.fg.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </span>
      <span style={{ color: theme.colors.fg.primary, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}
