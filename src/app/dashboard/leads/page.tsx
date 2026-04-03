'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/dashboard/Header'
import { Badge } from '@/components/ui/Badge'
import type { Lead } from '@/types'

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/leads')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setLeads(data || [])
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Header
        title="Leads"
        subtitle="Pipeline de prospectos y clientes"
        actions={
          <button className="rounded-lg bg-zero-risk-highlight px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors">
            + Nuevo Lead
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

        {!loading && !error && leads.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="text-4xl mb-4">👥</p>
            <h3 className="text-lg font-semibold text-gray-700">No hay leads</h3>
            <p className="mt-2 text-sm text-gray-400">
              Los leads aparecerán aquí cuando las campañas empiecen a captar prospectos
            </p>
          </div>
        )}

        {!loading && leads.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Fuente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Asignado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{lead.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{lead.email || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 capitalize">{lead.source.replace('_', ' ')}</td>
                    <td className="px-6 py-4"><Badge status={lead.status} /></td>
                    <td className="px-6 py-4 text-sm text-gray-500 capitalize">{lead.assigned_to}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(lead.created_at).toLocaleDateString('es-EC')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
