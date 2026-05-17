'use client'

import { useState, useRef } from 'react'
import { validateStep3, type Step3UploadAssets as Step3Data, type Step3UploadedAsset } from '@/lib/onboarding-schema'
import { Field } from './Step1ClientInfo'

interface Props {
  data: Step3Data
  slug: string
  onChange: (patch: Partial<Step3Data>) => void
  onNext: () => void
  onPrev: () => void
}

const MAX_FILE_SIZE_MB = 25
const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
]

export default function Step3UploadAssets({ data, slug, onChange, onNext, onPrev }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = async (files: FileList | File[]) => {
    if (!slug) {
      setErrors({ assets: 'Slug requerido (vuelve al paso 1)' })
      return
    }
    setUploading(true)
    setErrors({})
    const accepted = Array.from(files).filter(f => {
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) return false
      if (!ACCEPTED_TYPES.includes(f.type) && f.type !== '') return false
      return true
    })
    const newAssets: Step3UploadedAsset[] = []
    for (const file of accepted) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('slug', slug)
        fd.append('folder', 'onboarding-uploads')
        const res = await fetch('/api/onboarding/upload-asset', { method: 'POST', body: fd })
        const json = await res.json()
        if (json.ok) {
          newAssets.push({
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            storage_path: json.storage_path,
            public_url: json.public_url,
            uploaded_at: new Date().toISOString(),
          })
        }
      } catch (err) {
        console.warn('upload failed', file.name, err)
      }
    }
    onChange({ assets: [...data.assets, ...newAssets] })
    setUploading(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const result = validateStep3(data)
    setErrors(result.errors)
    if (!result.ok) return
    onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Assets del cliente</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sube fotos · brand book PDF · videos · audio · cualquier archivo de referencia. Storage path · <code className="text-xs">client-websites/{slug || '<slug>'}/onboarding-uploads/</code>
        </p>
      </div>

      <Field
        label="Archivos del cliente"
        id="assets"
        error={errors.assets}
        hint={`Max ${MAX_FILE_SIZE_MB}MB · PNG/JPG/WebP/SVG/PDF/MP4/MOV/MP3/WAV`}
      >
        <div
          onDragOver={e => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => {
            e.preventDefault()
            setDragActive(false)
            if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-12 text-center transition-colors ${
            dragActive ? 'border-cyan-500 bg-cyan-50' : 'border-slate-300 hover:border-violet-400 hover:bg-violet-50'
          } cursor-pointer`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            onChange={e => e.target.files && uploadFiles(e.target.files)}
          />
          <p className="text-base font-bold text-slate-900">
            {uploading ? 'Subiendo…' : 'Arrastra archivos aquí o haz click'}
          </p>
          <p className="mt-1 text-sm text-slate-600">PNG · JPG · WebP · SVG · PDF · MP4 · MOV · MP3 · WAV</p>
          <p className="mt-2 text-xs text-slate-500">Multi-file · cada archivo max {MAX_FILE_SIZE_MB}MB</p>
        </div>
      </Field>

      {data.assets.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">{data.assets.length} archivo(s) subido(s)</p>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {data.assets.map((a, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-lg">{iconFor(a.type)}</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={a.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-slate-900 hover:text-violet-700"
                    >
                      {a.name}
                    </a>
                    <p className="truncate text-xs text-slate-500">
                      {(a.size / 1024).toFixed(0)} KB · {a.type}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ assets: data.assets.filter((_, j) => j !== i) })}
                  className="text-xs font-medium text-rose-600 hover:underline"
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <button type="button" onClick={onPrev} className="zr-button-secondary">
          ← Atrás
        </button>
        <button type="submit" className="zr-button-primary">
          Siguiente · trigger cascade →
        </button>
      </div>
    </form>
  )
}

function iconFor(type: string): string {
  if (type.startsWith('image/')) return '🖼️'
  if (type.startsWith('video/')) return '🎬'
  if (type.startsWith('audio/')) return '🎵'
  if (type === 'application/pdf') return '📄'
  return '📎'
}
