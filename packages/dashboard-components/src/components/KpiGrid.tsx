'use client'
/**
 * KpiGrid · 4-up grid of KpiCards wired with the dashboard's headline
 * KPIs (agents · clients · spend · workflows).
 *
 * Pass a `KpiSnapshot` from real data or fixture. Format + deltaIsGood
 * presets are baked in per metric so the host doesn't have to remember
 * "spend going up is bad".
 */
import { KpiCard } from './KpiCard'
import type { KpiSnapshot } from '../types'

export interface KpiGridProps {
  snapshot: KpiSnapshot
}

export function KpiGrid({ snapshot }: KpiGridProps) {
  return (
    <div
      className="kpi-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
      }}
    >
      <KpiCard
        label="Agentes activos"
        metric={snapshot.agentsActive}
        format="number"
        deltaIsGood
        icon={<DotIcon />}
      />
      <KpiCard
        label="Clientes activos"
        metric={snapshot.clientsActive}
        format="number"
        deltaIsGood
        icon={<FolderIcon />}
      />
      <KpiCard
        label="Spend del mes"
        metric={snapshot.spendMonth}
        format="currency"
        deltaIsGood={false /* lower spend is good */}
        icon={<DollarIcon />}
      />
      <KpiCard
        label="Workflows activos"
        metric={snapshot.workflowsActive}
        format="number"
        deltaIsGood
        icon={<FlowIcon />}
      />
    </div>
  )
}

// Tiny inline SVG icons — keeps the package zero-dep.
function DotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="4" fill="currentColor" />
    </svg>
  )
}
function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 4.5C2 3.67 2.67 3 3.5 3h3.1c.4 0 .78.16 1.06.44L8.5 4.38c.28.28.66.44 1.06.44H12.5c.83 0 1.5.67 1.5 1.5v5.18c0 .83-.67 1.5-1.5 1.5h-9C2.67 13 2 12.33 2 11.5v-7z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
function DollarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v12M11 5.5C11 4.12 9.66 3 8 3s-3 1.12-3 2.5S6.34 8 8 8s3 1.12 3 2.5S9.66 13 8 13s-3-1.12-3-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function FlowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="3" cy="3" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="3" cy="13" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 4l6 3M5 12l6-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
