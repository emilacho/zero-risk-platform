'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/dashboard/Header'
import { Badge } from '@/components/ui/Badge'
import type { Content } from '@/types'

export default function ContentPage() {
  const [content, setContent] = useState<Content[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/content')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setContent(data || [])
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Header
        title="Contenido"
        subtitle="Material generado por AI agents"
        actions={
          <button className="rounded-lg bg-zero-risk-highlight px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors">
            + Generar Contenido
          </button>
        }
      />

      <div className="p-8">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-zero-risk-highlight" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!loading && !error && content.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="text-4xl mb-4">📝</p>
            <h3 className="text-lg font-semibold text-gray-700">No hay contenido generado</h3>
            <p className="mt-2 text-sm text-gray-400">
              Cuando los AI agents generen copy, imágenes o emails, aparecerán aquí
            </p>
          </div>
        )}

        {!loading && content.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {content.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-400 uppercase">{item.type.replace('_', ' ')}</span>
                  <Badge status={item.status} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{item.title}</h3>
                {item.body && (
                  <p className="mt-2 text-xs text-gray-500 line-clamp-3">{item.body}</p>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                  <span>Por: {item.generated_by}</span>
                  <span>{new Date(item.created_at).toLocaleDateString('es-EC')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
