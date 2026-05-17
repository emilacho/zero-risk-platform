'use client'

import { useState } from 'react'
import type { Step4CascadeTrigger, OnboardingWizardState } from '@/lib/onboarding-schema'

interface Props {
  data: Step4CascadeTrigger
  payload: OnboardingWizardState
  onChange: (patch: Partial<Step4CascadeTrigger>) => void
  onNext: () => void
  onPrev: () => void
}

export default function Step4TriggerCascade({ data, payload, onChange, onNext, onPrev }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)

  const trigger = async () => {
    setServerError(null)
    onChange({ status: 'triggered', triggered_at: new Date().toISOString(), progress_message: 'Enviando webhook a n8n…' })
    try {
      const res = await fetch('/api/onboarding/trigger-cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: payload.step1.slug,
          client_name: payload.step1.client_name,
          industry: payload.step1.industry,
          website_url: payload.step1.website_url,
          instagram_handle: payload.step1.instagram_handle || null,
          brand: {
            logo_url: payload.step2.logo_url,
            primary_color: payload.step2.primary_color,
            accent_color: payload.step2.accent_color,
            voice_tone: payload.step2.voice_tone,
            target_audience: payload.step2.target_audience,
            brand_keywords: payload.step2.brand_keywords,
          },
          assets: payload.step3.assets.map(a => ({ name: a.name, type: a.type, public_url: a.public_url })),
          onboarding_session_id: payload.onboarding_session_id,
          caller: 'onboarding-wizard',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Trigger failed')
      onChange({
        status: 'running',
        execution_id: json.execution_id || null,
        progress_message: `Cascade en ejecución · execution_id ${json.execution_id || 'n/a'}`,
      })
    } catch (err) {
      onChange({ status: 'error', progress_message: null })
      setServerError(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  const isIdle = data.status === 'idle'
  const isTriggered = data.status === 'triggered'
  const isRunning = data.status === 'running'
  const isSuccess = data.status === 'success'
  const isError = data.status === 'error'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Trigger cascade</h2>
        <p className="mt-1 text-sm text-slate-600">
          Dispara el workflow <code className="text-xs">cliente-nuevo-landing</code> en n8n · 9 agentes secuenciales · Camino III voting · Storage persistence · ETA ~10-14 min.
        </p>
      </div>

      <PayloadSummary payload={payload} />

      {isIdle && (
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-cyan-50 p-8 text-center">
          <p className="text-base font-semibold text-slate-900">Listo para disparar el cascade</p>
          <p className="mt-1 text-sm text-slate-600">
            Esto activará brand-strategist → market-research-analyst → creative-director → web-designer → content-creator → spell-check-corrector → editor-en-jefe → style-consistency-reviewer → delivery-coordinator + Hero generation.
          </p>
          <button
            type="button"
            onClick={trigger}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-6 py-3 text-base font-bold text-white shadow-lg shadow-violet-700/30 transition-all hover:bg-violet-800 hover:shadow-xl"
          >
            🚀 Disparar cascade
          </button>
        </div>
      )}

      {(isTriggered || isRunning) && (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-6">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 animate-pulse rounded-full bg-cyan-500" />
            <p className="text-base font-semibold text-slate-900">
              {isTriggered ? 'Webhook enviado…' : 'Cascade corriendo…'}
            </p>
          </div>
          {data.progress_message && <p className="mt-2 text-sm text-slate-700">{data.progress_message}</p>}
          {data.execution_id && (
            <p className="mt-1 font-mono text-xs text-slate-500">execution_id · {data.execution_id}</p>
          )}
        </div>
      )}

      {isSuccess && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-base font-semibold text-emerald-900">✓ Cascade completado</p>
          <p className="mt-1 text-sm text-emerald-700">Avanza al paso 5 para revisar outputs.</p>
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="text-base font-semibold text-rose-900">✕ Error disparando cascade</p>
          {serverError && <p className="mt-1 text-sm text-rose-700">{serverError}</p>}
          <button type="button" onClick={trigger} className="zr-button-secondary mt-3">
            Reintentar
          </button>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <button type="button" onClick={onPrev} className="zr-button-secondary">
          ← Atrás
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={isIdle}
          className="zr-button-primary disabled:opacity-50"
        >
          Siguiente · review →
        </button>
      </div>
    </div>
  )
}

function PayloadSummary({ payload }: { payload: OnboardingWizardState }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Payload preview</p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <SummaryRow label="Cliente" value={payload.step1.client_name || '—'} />
        <SummaryRow label="Slug" value={payload.step1.slug || '—'} mono />
        <SummaryRow label="Industria" value={payload.step1.industry || '—'} />
        <SummaryRow label="Website" value={payload.step1.website_url || '—'} />
        <SummaryRow label="Tono" value={payload.step2.voice_tone} />
        <SummaryRow label="Keywords" value={payload.step2.brand_keywords.join(' · ') || '—'} />
        <SummaryRow label="Assets" value={`${payload.step3.assets.length} archivo(s)`} />
        <SummaryRow label="Session ID" value={payload.onboarding_session_id || '—'} mono />
      </dl>
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`flex-1 truncate text-sm text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
