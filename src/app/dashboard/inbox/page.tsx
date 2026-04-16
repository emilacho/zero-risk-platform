'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================
// Types
// ============================================================

interface PipelineHITL {
  step_id: string
  pipeline_id: string
  step_index: number
  step_name: string
  agent: string
  objective: string
  client: string
  preview: string
  submitted_at: string
}

interface ImprovementProposal {
  id: string
  agent_name: string
  proposal_type: string
  title: string
  rationale: string
  expected_impact: string
  confidence_score: number
  priority: string
  created_at: string
}

interface OnboardingReview {
  id: string
  companyName: string
  websiteUrl: string
  status: string
  currentDay: number
  pagesScraped: number
  icpCount: number
  competitorCount: number
  hitlStatus?: string
  createdAt: string
}

type TabType = 'pipeline' | 'proposals' | 'onboarding'

// ============================================================
// Main Page
// ============================================================

export default function InboxPage() {
  const [activeTab, setActiveTab] = useState<TabType>('pipeline')
  const [pipelineItems, setPipelineItems] = useState<PipelineHITL[]>([])
  const [proposals, setProposals] = useState<ImprovementProposal[]>([])
  const [onboardings, setOnboardings] = useState<OnboardingReview[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [editContent, setEditContent] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [hitlRes, proposalRes, onboardingRes] = await Promise.allSettled([
        fetch('/api/hitl/pending').then(r => r.json()),
        fetch('/api/analytics/proposals?status=pending').then(r => r.json()),
        fetch('/api/onboarding?status=review_ready').then(r => r.json()),
      ])

      if (hitlRes.status === 'fulfilled') {
        setPipelineItems(hitlRes.value.items || [])
      }
      if (proposalRes.status === 'fulfilled') {
        setProposals(proposalRes.value.data || [])
      }
      if (onboardingRes.status === 'fulfilled') {
        setOnboardings(onboardingRes.value.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch inbox:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ============================================================
  // Actions
  // ============================================================

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const resolvePipelineHITL = async (stepId: string, decision: 'approved' | 'rejected' | 'edited') => {
    setActionLoading(stepId)
    try {
      const body: Record<string, string> = { step_id: stepId, decision }
      if (feedback[stepId]) body.feedback = feedback[stepId]
      if (decision === 'edited' && editContent[stepId]) body.edited_content = editContent[stepId]

      const res = await fetch('/api/hitl/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      showToast(`Pipeline step ${decision}: ${data.message}`, 'success')
      setPipelineItems(prev => prev.filter(i => i.step_id !== stepId))
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const resolveProposal = async (id: string, decision: 'approved' | 'rejected' | 'deferred') => {
    setActionLoading(id)
    try {
      const body: Record<string, string> = { decision }
      if (feedback[id]) body.notes = feedback[id]

      const res = await fetch(`/api/analytics/proposals/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      showToast(`Proposal ${decision}`, 'success')
      setProposals(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const resolveOnboarding = async (id: string, decision: 'approved' | 'revision_needed') => {
    setActionLoading(id)
    try {
      const body: Record<string, string> = { action: 'resolve', decision }
      if (feedback[id]) body.feedback = feedback[id]

      const res = await fetch(`/api/onboarding/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      showToast(`Onboarding ${decision === 'approved' ? 'aprobado' : 'requiere revisión'}`, 'success')
      setOnboardings(prev => prev.filter(o => o.id !== id))
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ============================================================
  // Counts
  // ============================================================

  const totalPending = pipelineItems.length + proposals.length + onboardings.length

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inbox HITL</h1>
            <p className="text-sm text-gray-500 mt-1">
              Aprobaciones pendientes — pipeline QA, mejoras de agentes, onboarding
            </p>
          </div>
          <div className="flex items-center gap-3">
            {totalPending > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                {totalPending} pendiente{totalPending !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={fetchAll}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? 'Cargando...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {([
            { key: 'pipeline' as TabType, label: 'Pipeline QA', count: pipelineItems.length },
            { key: 'proposals' as TabType, label: 'Mejoras Agentes', count: proposals.length },
            { key: 'onboarding' as TabType, label: 'Onboarding', count: onboardings.length },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Pipeline QA Tab */}
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              {pipelineItems.length === 0 ? (
                <EmptyState message="No hay pasos del pipeline pendientes de aprobación" />
              ) : (
                pipelineItems.map(item => (
                  <div key={item.step_id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                              Paso {item.step_index + 1}
                            </span>
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                              {item.agent}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-gray-900">{item.step_name}</h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            Cliente: <span className="font-medium">{item.client}</span> — {item.objective}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(item.submitted_at).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Preview */}
                      <button onClick={() => toggleExpand(item.step_id)} className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        {expandedItems.has(item.step_id) ? '▼ Ocultar preview' : '▶ Ver preview del contenido'}
                      </button>
                      {expandedItems.has(item.step_id) && (
                        <div className="mt-2 rounded-lg bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto border border-gray-100">
                          {item.preview}
                        </div>
                      )}

                      {/* Feedback input */}
                      <div className="mt-3">
                        <input
                          type="text"
                          placeholder="Feedback (opcional)..."
                          value={feedback[item.step_id] || ''}
                          onChange={e => setFeedback(prev => ({ ...prev, [item.step_id]: e.target.value }))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                        />
                      </div>

                      {/* Edit content (shown when expanded) */}
                      {expandedItems.has(item.step_id) && (
                        <div className="mt-2">
                          <textarea
                            placeholder="Contenido editado (solo si decides editar)..."
                            value={editContent[item.step_id] || ''}
                            onChange={e => setEditContent(prev => ({ ...prev, [item.step_id]: e.target.value }))}
                            rows={4}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => resolvePipelineHITL(item.step_id, 'approved')}
                          disabled={actionLoading === item.step_id}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === item.step_id ? '...' : '✓ Aprobar'}
                        </button>
                        {editContent[item.step_id] && (
                          <button
                            onClick={() => resolvePipelineHITL(item.step_id, 'edited')}
                            disabled={actionLoading === item.step_id}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            ✎ Aprobar con edición
                          </button>
                        )}
                        <button
                          onClick={() => resolvePipelineHITL(item.step_id, 'rejected')}
                          disabled={actionLoading === item.step_id}
                          className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                        >
                          ✗ Rechazar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Proposals Tab */}
          {activeTab === 'proposals' && (
            <div className="space-y-4">
              {proposals.length === 0 ? (
                <EmptyState message="No hay propuestas de mejora pendientes del meta-agente" />
              ) : (
                proposals.map(p => (
                  <div key={p.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <PriorityBadge priority={p.priority} />
                            <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-purple-200">
                              {p.proposal_type.replace('_', ' ')}
                            </span>
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                              {p.agent_name}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-gray-900">{p.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{p.rationale}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Impacto esperado: <span className="font-medium text-gray-700">{p.expected_impact}</span>
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            <span className="text-xs text-gray-400">
                              Confianza: {Math.round(p.confidence_score * 100)}%
                            </span>
                            <ConfidenceBar score={p.confidence_score} />
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>

                      {/* Feedback */}
                      <div className="mt-3">
                        <input
                          type="text"
                          placeholder="Notas de revisión (opcional)..."
                          value={feedback[p.id] || ''}
                          onChange={e => setFeedback(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                        />
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => resolveProposal(p.id, 'approved')}
                          disabled={actionLoading === p.id}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === p.id ? '...' : '✓ Aprobar cambio'}
                        </button>
                        <button
                          onClick={() => resolveProposal(p.id, 'deferred')}
                          disabled={actionLoading === p.id}
                          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                          ⏸ Diferir
                        </button>
                        <button
                          onClick={() => resolveProposal(p.id, 'rejected')}
                          disabled={actionLoading === p.id}
                          className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                        >
                          ✗ Rechazar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Onboarding Tab */}
          {activeTab === 'onboarding' && (
            <div className="space-y-4">
              {onboardings.length === 0 ? (
                <EmptyState message="No hay onboardings pendientes de revisión" />
              ) : (
                onboardings.map(o => (
                  <div key={o.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200">
                              Día {o.currentDay}
                            </span>
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                              {o.status}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-gray-900">{o.companyName}</h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            <a href={o.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {o.websiteUrl}
                            </a>
                          </p>
                          <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                            <span>{o.pagesScraped} páginas escaneadas</span>
                            <span>{o.icpCount} ICPs generados</span>
                            <span>{o.competitorCount} competidores analizados</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(o.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>

                      {/* Feedback */}
                      <div className="mt-3">
                        <input
                          type="text"
                          placeholder="Feedback del onboarding (opcional)..."
                          value={feedback[o.id] || ''}
                          onChange={e => setFeedback(prev => ({ ...prev, [o.id]: e.target.value }))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                        />
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => resolveOnboarding(o.id, 'approved')}
                          disabled={actionLoading === o.id}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === o.id ? '...' : '✓ Aprobar onboarding'}
                        </button>
                        <button
                          onClick={() => resolveOnboarding(o.id, 'revision_needed')}
                          disabled={actionLoading === o.id}
                          className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                        >
                          ↻ Requiere revisión
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
// Helper Components
// ============================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
      <div className="text-3xl mb-2">✅</div>
      <p className="text-sm text-gray-500">{message}</p>
      <p className="text-xs text-gray-400 mt-1">Todo al día</p>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 ring-red-200',
    high: 'bg-orange-100 text-orange-700 ring-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 ring-yellow-200',
    low: 'bg-gray-100 text-gray-600 ring-gray-200',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ${colors[priority] || colors.medium}`}>
      {priority}
    </span>
  )
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-16 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
