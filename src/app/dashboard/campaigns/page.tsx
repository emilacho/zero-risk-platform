'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/dashboard/Header'
import { Badge } from '@/components/ui/Badge'
import type { Campaign } from '@/types'

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/campaigns')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setCampaigns(data || [])
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Header
        title="Campañas"
        subtitle="Gestiona tus campañas de marketing"
        actions={
          <button className="rounded-lg bg-zero-risk-highlight px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors">
            + Nueva Campaña
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

        {!loading && !error && campaigns.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="text-4xl mb-4">📢</p>
            <h3 className="text-lg font-semibold text-gray-700">No hay campañas</h3>
            <p className="mt-2 text-sm text-gray-400">
              Crea tu primera campaña para comenzar a captar leads
            </p>
          </div>
        )}

        {!loading && campaigns.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Presupuesto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Gasto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Inicio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{campaign.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 capitalize">{campaign.type.replace('_', ' ')}</td>
                    <td className="px-6 py-4"><Badge status={campaign.status} /></td>
                    <td className="px-6 py-4 text-sm text-gray-700">${campaign.budget.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">${campaign.spend.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(campaign.start_date).toLocaleDateString('es-EC')}</td>
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
