'use client'
/**
 * BentoGrid · 12-column bento layout primitive for the dashboard.
 *
 * Each child declares how many columns (and optionally rows) it spans on
 * desktop. On narrow viewports everything collapses to 1 column for
 * mobile-first integrity.
 *
 * Usage:
 *   <BentoGrid>
 *     <BentoGrid.Cell colSpan={8} rowSpan={2}>
 *       <LineChartCostTimeline ... />
 *     </BentoGrid.Cell>
 *     <BentoGrid.Cell colSpan={4}>
 *       <BarListTopAgents ... />
 *     </BentoGrid.Cell>
 *   </BentoGrid>
 */
import { CSSProperties, ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface BentoGridProps {
  children: ReactNode
  /** Column count · default 12. */
  columns?: number
  /** Pixel gap between cells. */
  gap?: number
  className?: string
}

function BentoGridRoot({ children, columns = 12, gap = 16, className }: BentoGridProps) {
  return (
    <div
      className={cn('bento-grid', className)}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(80px, auto)',
        gap,
      }}
    >
      {children}
    </div>
  )
}

export interface BentoCellProps {
  children: ReactNode
  colSpan?: number
  rowSpan?: number
  /** Min row height in px (helps charts/feeds breathe). */
  minHeight?: number
  className?: string
  style?: CSSProperties
}

function BentoCell({ children, colSpan = 4, rowSpan = 1, minHeight, className, style }: BentoCellProps) {
  return (
    <div
      className={cn('bento-cell', className)}
      style={{
        gridColumn: `span ${colSpan} / span ${colSpan}`,
        gridRow: `span ${rowSpan} / span ${rowSpan}`,
        minHeight,
        minWidth: 0, // critical · lets children with overflow:hidden actually fit
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export const BentoGrid = Object.assign(BentoGridRoot, { Cell: BentoCell })
