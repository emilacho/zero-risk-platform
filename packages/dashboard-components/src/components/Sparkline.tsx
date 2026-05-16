'use client'
/**
 * Sparkline · zero-dep tiny line chart. Used inside KpiCard and
 * SparklineAgentStats. Hand-rolled SVG keeps the bundle small and the
 * visual fully theme-controlled.
 */
import { theme } from '../theme'
import type { SparklinePoint } from '../types'

export interface SparklineProps {
  points: SparklinePoint[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
  /** Show the area under the line with a subtle gradient. */
  area?: boolean
  /** Add a dot at the last point for emphasis. */
  showEndDot?: boolean
}

export function Sparkline({
  points,
  width = 120,
  height = 36,
  stroke = theme.colors.primary[400],
  fill,
  area = true,
  showEndDot = true,
}: SparklineProps) {
  if (!points || points.length < 2) {
    return <svg width={width} height={height} role="img" aria-label="sparkline · no data" />
  }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const padding = 2

  const scaleX = (v: number) =>
    maxX === minX ? width / 2 : padding + ((v - minX) / (maxX - minX)) * (width - padding * 2)
  const scaleY = (v: number) =>
    maxY === minY
      ? height / 2
      : height - padding - ((v - minY) / (maxY - minY)) * (height - padding * 2)

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x).toFixed(2)} ${scaleY(p.y).toFixed(2)}`)
    .join(' ')
  const areaPath = area
    ? `${linePath} L ${scaleX(maxX).toFixed(2)} ${height} L ${scaleX(minX).toFixed(2)} ${height} Z`
    : ''
  const gradId = `sparkfill-${Math.random().toString(36).slice(2, 7)}`
  const last = points[points.length - 1]

  return (
    <svg width={width} height={height} role="img" aria-label="sparkline">
      {area ? (
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={fill ?? stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={fill ?? stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
      ) : null}
      {area ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showEndDot ? (
        <circle cx={scaleX(last.x)} cy={scaleY(last.y)} r={2.4} fill={stroke} />
      ) : null}
    </svg>
  )
}
