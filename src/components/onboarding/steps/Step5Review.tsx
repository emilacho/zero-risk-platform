'use client'

import { useState } from 'react'
import type { Step5CascadeOutputs, OnboardingWizardState } from '@/lib/onboarding-schema'

interface Props {
  data: Step5CascadeOutputs
  state: OnboardingWizardState
  onChange: (patch: Partial<Step5CascadeOutputs>) => void
  onPrev: () => void
}

export default function Step5Review({ data, state, onChange, onPrev }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [completedAt, setCompletedAt] = useState<string | null>(null)

  const handleApprove = async () => {
    setSubmitting(true)
    try {
      if (state.onboarding_session_id) {
        await fetch(`/api/onboarding/${state.onboarding_session_id}/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => null)
      }
      onChange({ approved: true, reviewed: true })
      setCompletedAt(new Date().toISOString())
    } finally {
      setSubmitting(false)
    }
  }

  const handleIterate = () => {
    onChange({ reviewed: true, approved: false })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Review outputs</h2>
        <p className="mt-1 text-sm text-slate-600">
          Validá los entregables · aprobá para activar el cliente · o pedí iteración con notas para el cascade.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <OutputCard
          title="Landing preview"
          status={data.landing_preview_url ? 'ready' : 'pending'}
          url={data.landing_preview_url}
          fallback={`/clients/${state.step1.slug}`}
        />
        <OutputCard
          title="Brand book PDF"
          status={data.brand_book_pdf_url ? 'ready' : 'pending'}
          url={data.brand_book_pdf_url}
        />
        <OutputCard
          title="Social storyboards"
          status={data.social_storyboards.length > 0 ? 'ready' : 'pending'}
          subtitle={`${data.social_storyboards.length} plataforma(s)`}
        />
        <OutputCard
          title="Agent outputs (JSON)"
          status={Object.keys(data.agent_outputs).length > 0 ? 'ready' : 'pending'}
          subtitle={`${Object.keys(data.agent_outputs).length} agente(s)`}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <label htmlFor="iteration_notes" className="text-sm font-semibold text-slate-900">
          Notas de iteración (si pedís cambios)
        </label>
        <textarea
          id="iteration_notes"
          value={data.iteration_notes}
          onChange={e => onChange({ iteration_notes: e.target.value })}
          className="zr-input mt-2 min-h-[100px]"
          placeholder="Ej · el copy del hero está muy formal · necesitamos un tono más cálido · ajustar palette · agregar mención del distintivo costero"
          rows={4}
        />
      </div>

      {data.approved && completedAt && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-6">
          <p className="text-lg font-bold text-emerald-900">✓ Cliente activado</p>
          <p className="mt-1 text-sm text-emerald-700">
            <code className="text-xs">{state.step1.slug}</code> · marcado activo en {new Date(completedAt).toLocaleString('es-EC')}.
          </p>
          <p className="mt-3 text-xs text-slate-600">
            Próximos pasos · primer Campaign Brief · Mission Control dashboard · /clients/{state.step1.slug}.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <button type="button" onClick={onPrev} className="zr-button-secondary">
          ← Atrás
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={handleIterate} className="zr-button-secondary">
            Pedir iteración
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={submitting || data.approved}
            className="zr-button-primary disabled:opacity-50"
          >
            {submitting ? 'Activando…' : data.approved ? '✓ Activado' : 'Aprobar y activar cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OutputCard({
  title,
  status,
  url,
  subtitle,
  fallback,
}: {
  title: string
  status: 'ready' | 'pending'
  url?: string | null
  subtitle?: string
  fallback?: string
}) {
  const target = url || fallback
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
            status === 'ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {status === 'ready' ? 'ready' : 'pending'}
        </span>
      </div>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      {target ? (
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-semibold text-violet-700 hover:text-violet-900 hover:underline"
        >
          Abrir →
        </a>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Esperando output del cascade…</p>
      )}
    </div>
  )
}
