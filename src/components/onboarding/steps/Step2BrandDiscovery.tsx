'use client'

import { useState } from 'react'
import { validateStep2, VOICE_TONE_OPTIONS, type Step2BrandDiscovery as Step2Data } from '@/lib/onboarding-schema'
import { Field } from './Step1ClientInfo'

interface Props {
  data: Step2Data
  slug: string
  onChange: (patch: Partial<Step2Data>) => void
  onNext: () => void
  onPrev: () => void
}

export default function Step2BrandDiscovery({ data, slug, onChange, onNext, onPrev }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [keywordDraft, setKeywordDraft] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const handleLogoUpload = async (file: File) => {
    if (!slug) {
      setErrors({ logo: 'Slug requerido (vuelve al paso 1)' })
      return
    }
    setUploadingLogo(true)
    setErrors(prev => ({ ...prev, logo: '' }))
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('slug', slug)
      fd.append('folder', 'brand')
      fd.append('filename', `logo.${file.name.split('.').pop() || 'png'}`)
      const res = await fetch('/api/onboarding/upload-asset', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Logo upload failed')
      onChange({ logo_url: json.public_url })
    } catch (err) {
      setErrors(prev => ({ ...prev, logo: err instanceof Error ? err.message : 'Error subiendo logo' }))
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const result = validateStep2(data)
    setErrors(result.errors)
    if (!result.ok) return
    onNext()
  }

  const addKeyword = () => {
    const k = keywordDraft.trim()
    if (k && !data.brand_keywords.includes(k) && data.brand_keywords.length < 12) {
      onChange({ brand_keywords: [...data.brand_keywords, k] })
      setKeywordDraft('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Brand discovery</h2>
        <p className="mt-1 text-sm text-slate-600">
          Identidad visual + voz · alimenta a brand-strategist + creative-director en el cascade.
        </p>
      </div>

      <Field label="Logo del cliente" id="logo" error={errors.logo} hint="PNG / SVG / JPG · sube tu logo principal">
        <div className="flex items-center gap-4">
          {data.logo_url ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.logo_url} alt="Logo preview" className="h-16 w-16 rounded-md object-contain bg-white" />
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Logo subido ✓</p>
                <button type="button" onClick={() => onChange({ logo_url: null })} className="mt-1 text-rose-600 hover:underline">
                  Reemplazar
                </button>
              </div>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-4 text-sm text-slate-600 hover:border-violet-400 hover:bg-violet-50">
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                disabled={uploadingLogo}
              />
              <span>{uploadingLogo ? 'Subiendo…' : '📎 Elegir logo'}</span>
            </label>
          )}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="Color primario" id="primary_color" required error={errors.primary_color} hint="Brand color principal">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={data.primary_color}
              onChange={e => onChange({ primary_color: e.target.value.toUpperCase() })}
              className="h-12 w-16 cursor-pointer rounded-md border border-slate-300"
            />
            <input
              type="text"
              value={data.primary_color}
              onChange={e => onChange({ primary_color: e.target.value })}
              className="zr-input font-mono"
              placeholder="#3D2466"
            />
          </div>
        </Field>
        <Field label="Color accent" id="accent_color" required error={errors.accent_color} hint="Color secundario / highlights">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={data.accent_color}
              onChange={e => onChange({ accent_color: e.target.value.toUpperCase() })}
              className="h-12 w-16 cursor-pointer rounded-md border border-slate-300"
            />
            <input
              type="text"
              value={data.accent_color}
              onChange={e => onChange({ accent_color: e.target.value })}
              className="zr-input font-mono"
              placeholder="#4DD4D8"
            />
          </div>
        </Field>
      </div>

      <Field label="Tono de voz" id="voice_tone" required error={errors.voice_tone}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {VOICE_TONE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ voice_tone: opt.value })}
              className={`rounded-lg border-2 px-4 py-3 text-left transition-all ${
                data.voice_tone === opt.value
                  ? 'border-violet-700 bg-violet-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`text-sm font-bold ${data.voice_tone === opt.value ? 'text-violet-900' : 'text-slate-900'}`}>
                {opt.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">{opt.description}</p>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Audiencia objetivo" id="target_audience" required error={errors.target_audience} hint="Mínimo 10 caracteres · describe ICP (perfil del cliente ideal)">
        <textarea
          id="target_audience"
          value={data.target_audience}
          onChange={e => onChange({ target_audience: e.target.value })}
          className="zr-input min-h-[100px]"
          placeholder="Familias y turistas en la costa ecuatoriana buscando comida típica auténtica · 25-55 años · presupuesto medio"
          rows={4}
          required
        />
      </Field>

      <Field label="Palabras clave de marca (opcional · max 12)" id="brand_keywords" hint="Tags · vibe · valores · ej. 'auténtico · costero · familiar · tradición'">
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={keywordDraft}
              onChange={e => setKeywordDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addKeyword()
                }
              }}
              className="zr-input flex-1"
              placeholder="auténtico"
              disabled={data.brand_keywords.length >= 12}
            />
            <button
              type="button"
              onClick={addKeyword}
              className="zr-button-secondary"
              disabled={data.brand_keywords.length >= 12 || !keywordDraft.trim()}
            >
              + agregar
            </button>
          </div>
          {data.brand_keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.brand_keywords.map(k => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-800 ring-1 ring-cyan-200"
                >
                  {k}
                  <button
                    type="button"
                    onClick={() => onChange({ brand_keywords: data.brand_keywords.filter(x => x !== k) })}
                    className="text-cyan-600 hover:text-cyan-900"
                    aria-label={`Remove ${k}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Field>

      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <button type="button" onClick={onPrev} className="zr-button-secondary">
          ← Atrás
        </button>
        <button type="submit" className="zr-button-primary">
          Siguiente · assets →
        </button>
      </div>
    </form>
  )
}
