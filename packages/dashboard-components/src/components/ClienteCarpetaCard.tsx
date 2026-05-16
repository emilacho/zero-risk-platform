'use client'
/**
 * ClienteCarpetaCard · "carpeta del cliente" · folder-style client card.
 *
 * Visual metaphor of a manila folder: tabbed top, client name spine,
 * KPI strip, health-score bar, and a footer with the latest activity
 * relative time.
 */
import { theme } from '../theme'
import { cn } from '../utils/cn'
import { formatCurrency, formatNumber, formatRelativeTime } from '../utils/format'
import type { ClientFolder, ClientStatus } from '../types'

export interface ClienteCarpetaCardProps {
  folder: ClientFolder
  onOpen?: () => void
  className?: string
}

const STATUS_STYLES: Record<ClientStatus, { fg: string; bg: string; label: string }> = {
  active:     { fg: '#34d399', bg: 'rgba(16,185,129,0.18)', label: 'activo' },
  onboarding: { fg: '#67e8f9', bg: 'rgba(6,182,212,0.18)',  label: 'onboarding' },
  paused:     { fg: '#fbbf24', bg: 'rgba(245,158,11,0.18)', label: 'pausado' },
  churned:    { fg: '#fca5a5', bg: 'rgba(239,68,68,0.18)',  label: 'churn' },
}

export function ClienteCarpetaCard({ folder, onOpen, className }: ClienteCarpetaCardProps) {
  const s = STATUS_STYLES[folder.status]
  const interactive = !!onOpen
  const healthColor =
    folder.healthScore >= 75 ? theme.colors.success
    : folder.healthScore >= 50 ? theme.colors.warning
    : theme.colors.danger

  return (
    <div
      className={cn('cliente-carpeta', className)}
      onClick={onOpen}
      style={{
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radius.lg,
        position: 'relative',
        padding: 0,
        cursor: interactive ? 'pointer' : 'default',
        overflow: 'hidden',
        transition: `border-color ${theme.motion.fast}, transform ${theme.motion.fast}`,
      }}
    >
      {/* Folder tab · top-left · violet→cyan accent ribbon */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 16,
          width: 64,
          height: 6,
          borderBottomLeftRadius: theme.radius.sm,
          borderBottomRightRadius: theme.radius.sm,
          background: `linear-gradient(90deg, ${theme.colors.primary[500]}, ${theme.colors.accent[500]})`,
        }}
      />

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header · name + status pill */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ color: theme.colors.fg.primary, fontSize: 16, fontWeight: 600 }}>{folder.name}</span>
            <span style={{ color: theme.colors.fg.muted, fontSize: 11, marginTop: 2 }}>{folder.industry}</span>
          </div>
          <span
            style={{
              background: s.bg,
              color: s.fg,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              padding: '3px 7px',
              borderRadius: theme.radius.sm,
            }}
          >
            {s.label}
          </span>
        </div>

        {/* KPI strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            padding: '10px 0',
            borderTop: `1px solid ${theme.colors.border.subtle}`,
            borderBottom: `1px solid ${theme.colors.border.subtle}`,
          }}
        >
          <Stat label="spend mes" value={formatCurrency(folder.spendMonth, { compact: true })} />
          <Stat label="invocaciones 30d" value={formatNumber(folder.invocations30d, { compact: true })} />
          <Stat label="workflows" value={String(folder.workflowsActive)} />
        </div>

        {/* Health score bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: theme.colors.fg.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              health score
            </span>
            <span style={{ color: healthColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {folder.healthScore}/100
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
                width: `${folder.healthScore}%`,
                height: '100%',
                background: healthColor,
                transition: `width ${theme.motion.slow} ease`,
              }}
            />
          </div>
        </div>

        {/* Footer · last activity + cascades shipped */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: theme.colors.fg.muted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{folder.cascadesShipped} cascadas enviadas</span>
          <span>última actividad · {formatRelativeTime(folder.lastActivity)}</span>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: theme.colors.fg.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </span>
      <span style={{ color: theme.colors.fg.primary, fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}
