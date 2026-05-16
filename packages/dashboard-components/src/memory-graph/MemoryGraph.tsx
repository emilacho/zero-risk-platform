'use client'
/**
 * MemoryGraph · ReactFlow canvas rendering the client-centric memory web.
 *
 * Layout is deterministic (computed from the data shape) so the graph
 * renders consistently across runs. For larger graphs the host can swap
 * to `dagre` or `elkjs` for force-directed layouts · this in-memory
 * algorithm covers the 5-30 node range that the dashboard needs.
 */
import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { memoryNodeTypes, type MemoryGraphNode } from './MemoryNodes'
import { theme } from '../theme'
import { cn } from '../utils/cn'
import type { MemoryGraphData, MemoryNodeData, MemoryNodeKind } from '../types'

export interface MemoryGraphProps {
  data: MemoryGraphData
  /** Container height · ReactFlow needs a fixed h. */
  height?: number | string
  /** Title rendered above the canvas · pass null to suppress. */
  title?: string | null
  className?: string
}

// ── Deterministic layout ───────────────────────────────────────────────
// Strategy:
//   - 1 client node · center
//   - agents · ring at radius R1 around the client
//   - workflows · upper band (above center)
//   - tools · lower band (below center)
function layoutNodes(data: MemoryGraphData): MemoryGraphNode[] {
  const byKind: Record<MemoryNodeKind, MemoryNodeData[]> = {
    client: [],
    agent: [],
    workflow: [],
    tool: [],
  }
  for (const n of data.nodes) byKind[n.kind].push(n)

  const out: MemoryGraphNode[] = []
  const CX = 480
  const CY = 320

  // Client(s) at center · single is the normal case
  byKind.client.forEach((n, i) => {
    out.push({
      id: n.id,
      type: 'client',
      data: n,
      position: { x: CX - 100, y: CY - 40 + i * 100 },
    })
  })

  // Agents · ring around client
  const agentCount = byKind.agent.length || 1
  const R1 = 280
  byKind.agent.forEach((n, i) => {
    // Spread agents along ~270° arc on the right side so workflows/tools
    // can occupy the upper/lower bands on the left without overlap.
    const startAngle = -Math.PI / 2 + 0.2  // top-right
    const arc = Math.PI + 0.6              // ~210°
    const t = agentCount === 1 ? 0.5 : i / (agentCount - 1)
    const angle = startAngle + t * arc
    out.push({
      id: n.id,
      type: 'agent',
      data: n,
      position: {
        x: CX + Math.cos(angle) * R1,
        y: CY + Math.sin(angle) * R1,
      },
    })
  })

  // Workflows · upper-left band
  const wfCount = byKind.workflow.length || 1
  byKind.workflow.forEach((n, i) => {
    const x = 60 + (i % 2) * 240
    const y = 40 + Math.floor(i / 2) * 110
    out.push({
      id: n.id,
      type: 'workflow',
      data: n,
      position: { x, y },
    })
  })

  // Tools · lower-left band
  byKind.tool.forEach((n, i) => {
    const x = 60 + (i % 3) * 200
    const y = CY + 200 + Math.floor(i / 3) * 80
    out.push({
      id: n.id,
      type: 'tool',
      data: n,
      position: { x, y },
    })
  })

  return out
}

function buildEdges(data: MemoryGraphData): Edge[] {
  return data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    labelStyle: {
      fontSize: 10,
      fill: theme.colors.fg.muted,
      fontFamily: theme.font.mono,
    },
    labelBgStyle: {
      fill: theme.colors.bg.surface,
      stroke: theme.colors.border.subtle,
    },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
    style: {
      stroke: theme.colors.border.default,
      strokeWidth: 1.2,
    },
    animated: e.label === 'next',  // animate cascade-flow edges
    type: 'smoothstep',
  }))
}

export function MemoryGraph({
  data,
  height = 560,
  title = 'Memory graph · cliente · agentes · workflows · tools',
  className,
}: MemoryGraphProps) {
  const nodes = useMemo(() => layoutNodes(data), [data])
  const edges = useMemo(() => buildEdges(data), [data])

  return (
    <div
      className={cn('memory-graph', className)}
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
      {title !== null ? (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ color: theme.colors.fg.primary, fontSize: 14, fontWeight: 600 }}>{title}</span>
          <span style={{ color: theme.colors.fg.muted, fontSize: 11 }}>
            {nodes.length} nodos · {edges.length} relaciones
          </span>
        </div>
      ) : null}
      <div
        style={{
          height,
          background: theme.colors.bg.base,
          border: `1px solid ${theme.colors.border.subtle}`,
          borderRadius: theme.radius.md,
          overflow: 'hidden',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={memoryNodeTypes}
          fitView
          minZoom={0.4}
          maxZoom={1.6}
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} color={theme.colors.border.subtle} gap={20} size={1} />
          <Controls
            position="bottom-right"
            style={{
              background: theme.colors.bg.surface,
              border: `1px solid ${theme.colors.border.subtle}`,
              borderRadius: theme.radius.md,
            }}
          />
          <MiniMap
            position="top-right"
            pannable
            zoomable
            nodeColor={(n) =>
              n.type === 'client' ? theme.colors.primary[500]
              : n.type === 'agent' ? theme.colors.accent[500]
              : n.type === 'workflow' ? theme.colors.warning
              : theme.colors.fg.muted
            }
            maskColor="rgba(10,10,15,0.6)"
            style={{
              background: theme.colors.bg.surface,
              border: `1px solid ${theme.colors.border.subtle}`,
              borderRadius: theme.radius.md,
            }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
