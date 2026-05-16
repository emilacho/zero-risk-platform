'use client'
/**
 * MemoryNodes · custom node renderers for the ReactFlow memory graph.
 *
 * Four kinds · client (central), agent, workflow, tool. Each has its
 * own visual treatment that maps to the dashboard theme (violet primary,
 * cyan accent, dark surface). Hand-rolled so the host doesn't need to
 * pull in additional shadcn/UI deps.
 */
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { theme } from '../theme'
import type { MemoryNodeData, MemoryNodeKind } from '../types'

/**
 * Full ReactFlow Node type for our custom data shape. NodeProps wants the
 * complete Node<TData, TType>, not just TData, in @xyflow/react v12.
 */
export type MemoryGraphNode = Node<MemoryNodeData, MemoryNodeKind>

// ── Shared style helpers ───────────────────────────────────────────────
const baseNodeStyle = {
  fontFamily: theme.font.sans,
  color: theme.colors.fg.primary,
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.colors.border.subtle}`,
  background: theme.colors.bg.surface,
  padding: '10px 14px',
  minWidth: 160,
  fontSize: 12,
  lineHeight: 1.3,
  boxShadow: theme.shadow.md,
}

function handleStyle(kind: MemoryNodeKind) {
  const color =
    kind === 'client' ? theme.colors.primary[500]
    : kind === 'agent' ? theme.colors.accent[500]
    : kind === 'workflow' ? theme.colors.warning
    : theme.colors.fg.muted
  return {
    background: color,
    border: `2px solid ${theme.colors.bg.base}`,
    width: 8,
    height: 8,
  }
}

// ── Client node · central · larger · violet glow ───────────────────────
export function ClientNode({ data }: NodeProps<MemoryGraphNode>) {
  return (
    <div
      style={{
        ...baseNodeStyle,
        padding: '14px 18px',
        minWidth: 200,
        border: `1px solid ${theme.colors.primary[500]}`,
        background: `linear-gradient(135deg, ${theme.colors.bg.surfaceActive}, ${theme.colors.bg.surface})`,
        boxShadow: theme.shadow.glow,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle('client')} />
      <Handle type="source" position={Position.Right} style={handleStyle('client')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: theme.radius.full,
            background: theme.colors.primary[500],
            boxShadow: `0 0 8px ${theme.colors.primary[500]}`,
          }}
        />
        <span style={{ fontSize: 10, color: theme.colors.primary[400], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          cliente
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{data.label}</div>
      {data.meta?.industry ? (
        <div style={{ fontSize: 11, color: theme.colors.fg.secondary, marginTop: 4 }}>{data.meta.industry}</div>
      ) : null}
      {typeof data.meta?.healthScore === 'number' ? (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, color: theme.colors.fg.muted, marginBottom: 3 }}>
            health · {data.meta.healthScore}/100
          </div>
          <div style={{ height: 4, background: theme.colors.bg.surfaceActive, borderRadius: theme.radius.full, overflow: 'hidden' }}>
            <div
              style={{
                width: `${data.meta.healthScore}%`,
                height: '100%',
                background: theme.colors.success,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Agent node · cyan accent ───────────────────────────────────────────
export function AgentNode({ data }: NodeProps<MemoryGraphNode>) {
  return (
    <div
      style={{
        ...baseNodeStyle,
        borderLeft: `2px solid ${theme.colors.accent[500]}`,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle('agent')} />
      <Handle type="source" position={Position.Right} style={handleStyle('agent')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: theme.colors.accent[400], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          agent
        </span>
        {data.meta?.role ? (
          <span style={{ fontSize: 9, color: theme.colors.fg.muted }}>· {data.meta.role}</span>
        ) : null}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{data.label}</div>
      {data.meta?.model ? (
        <code style={{ fontFamily: theme.font.mono, fontSize: 10, color: theme.colors.fg.muted, marginTop: 4, display: 'inline-block' }}>
          {data.meta.model}
        </code>
      ) : null}
    </div>
  )
}

// ── Workflow node · amber accent ───────────────────────────────────────
export function WorkflowNode({ data }: NodeProps<MemoryGraphNode>) {
  return (
    <div
      style={{
        ...baseNodeStyle,
        borderLeft: `2px solid ${theme.colors.warning}`,
        minWidth: 140,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle('workflow')} />
      <Handle type="source" position={Position.Right} style={handleStyle('workflow')} />
      <div style={{ fontSize: 9, color: theme.colors.warning, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        workflow
      </div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{data.label}</div>
      {typeof data.meta?.runs24h === 'number' ? (
        <div style={{ fontSize: 10, color: theme.colors.fg.muted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
          {data.meta.runs24h} runs · 24h
        </div>
      ) : null}
    </div>
  )
}

// ── Tool node · muted · pill-shaped ────────────────────────────────────
export function ToolNode({ data }: NodeProps<MemoryGraphNode>) {
  return (
    <div
      style={{
        ...baseNodeStyle,
        borderRadius: theme.radius.full,
        padding: '8px 14px',
        minWidth: 0,
        background: theme.colors.bg.surfaceActive,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle('tool')} />
      <Handle type="source" position={Position.Right} style={handleStyle('tool')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 9, color: theme.colors.fg.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          tool
        </span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{data.label}</span>
      </div>
      {data.meta?.surface ? (
        <div style={{ fontSize: 9, color: theme.colors.fg.muted, marginTop: 2 }}>{data.meta.surface}</div>
      ) : null}
    </div>
  )
}

// ── Registry passed to ReactFlow ───────────────────────────────────────
export const memoryNodeTypes = {
  client: ClientNode,
  agent: AgentNode,
  workflow: WorkflowNode,
  tool: ToolNode,
}
