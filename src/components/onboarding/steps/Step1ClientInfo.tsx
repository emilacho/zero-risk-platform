'use client'

import { useState } from 'react'
import { slugify, validateStep1, type Step1ClientInfo as Step1Data } from '@/lib/onboarding-schema'

interface Props {
  data: Step1Data
  onChange: (patch: Partial<Step1Data>) => void
  onNext: () => void
  setSessionId: (id: string) => void
}

export default function Step1ClientInfo({ data, onChange, onNext, setSessionId }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const handleNameChange = (value: string) => {
    onChange({ client_name: value })
    if (!data.slug || data.slug === slugify(data.client_name)) {
      onChange({ client_name: value, slug: slugify(value) })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validateStep1(data)
    setErrors(result.errors)
    if (!result.ok) return

    setSubmitting(true)
    setServerError(null)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: data.client_name,
          websiteUrl: data.website_url,
          industry: data.industry,
          targetAudience: '',
          additionalNotes: `slug=${data.slug}; instagram=${data.instagram_handle || 'n/a'}`,
          createdBy: 'onboarding-wizard',
        }),
      })
      const json = await res.json()
      if (json.session_id || json.onboarding_id) {
        setSessionId(String(json.session_id || json.onboarding_id))
      }
      onNext()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error desconocido al crear sesión de onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Información del cliente</h2>
        <p className="mt-1 text-sm text-slate-600">
          Datos básicos · esto crea la sesión de onboarding y el directorio en Supabase Storage.
        </p>
      </div>

      <Field
        label="Nombre del cliente"
        id="client_name"
        required
        error={errors.client_name}
        hint="Nombre comercial · ej. 'Náufrago Ceviches'"
      >
        <input
          id="client_name"
          type="text"
          value={data.client_name}
          onChange={e => handleNameChange(e.target.value)}
          className="zr-input"
          placeholder="Náufrago Ceviches"
          required
        />
      </Field>

      <Field
        label="Slug (URL-safe)"
        id="slug"
        required
        error={errors.slug}
        hint="kebab-case · solo letras minúsculas · números · guiones · auto-generado del nombre"
      >
        <input
          id="slug"
          type="text"
          value={data.slug}
          onChange={e => onChange({ slug: e.target.value })}
          className="zr-input font-mono"
          placeholder="naufrago-ceviches"
          required
        />
      </Field>

      <Field
        label="Industria / vertical"
        id="industry"
        required
        error={errors.industry}
        hint="Vertical principal · ej. 'restaurante · gastronómico · costero'"
      >
        <input
          id="industry"
          type="text"
          value={data.industry}
          onChange={e => onChange({ industry: e.target.value })}
          className="zr-input"
          placeholder="Restaurante de mariscos · cocina costera"
          required
        />
      </Field>

      <Field
        label="Website actual"
        id="website_url"
        required
        error={errors.website_url}
        hint="URL completa con http(s)://"
      >
        <input
          id="website_url"
          type="url"
          value={data.website_url}
          onChange={e => onChange({ website_url: e.target.value })}
          className="zr-input"
          placeholder="https://naufrago.ec"
          required
        />
      </Field>

      <Field
        label="Handle de Instagram (opcional)"
        id="instagram_handle"
        error={errors.instagram_handle}
        hint="Sin @ · ej. naufragoec · auto-discovery scraper consume esto"
      >
        <input
          id="instagram_handle"
          type="text"
          value={data.instagram_handle}
          onChange={e => onChange({ instagram_handle: e.target.value.replace(/^@/, '') })}
          className="zr-input"
          placeholder="naufragoec"
        />
      </Field>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="zr-button-primary"
        >
          {submitting ? 'Creando sesión…' : 'Siguiente · brand discovery →'}
        </button>
      </div>
    </form>
  )
}

interface FieldProps {
  label: string
  id: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}

export function Field({ label, id, required, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-slate-900">
          {label}
          {required && <span className="ml-1 text-rose-500">*</span>}
        </label>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  )
}
