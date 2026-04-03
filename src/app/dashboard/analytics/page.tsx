import { Header } from '@/components/dashboard/Header'
import { SimpleCard } from '@/components/ui/Card'

export default function AnalyticsPage() {
  return (
    <>
      <Header
        title="Analytics"
        subtitle="Métricas y rendimiento de campañas"
      />

      <div className="p-8 space-y-6">
        <SimpleCard title="Métricas Generales">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { label: 'Impresiones', value: '0' },
              { label: 'Clicks', value: '0' },
              { label: 'CTR', value: '0%' },
              { label: 'CPL', value: '$0' },
            ].map((metric) => (
              <div key={metric.label} className="text-center">
                <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                <p className="mt-1 text-xs text-gray-400">{metric.label}</p>
              </div>
            ))}
          </div>
        </SimpleCard>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SimpleCard title="Leads por Fuente">
            <div className="flex items-center justify-center py-12 text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-3">📈</p>
                <p className="text-sm">Los gráficos aparecerán cuando haya datos</p>
              </div>
            </div>
          </SimpleCard>

          <SimpleCard title="Gasto por Plataforma">
            <div className="flex items-center justify-center py-12 text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-3">💰</p>
                <p className="text-sm">Sin gastos registrados todavía</p>
              </div>
            </div>
          </SimpleCard>
        </div>

        <SimpleCard title="ROI por Campaña">
          <div className="rounded-lg bg-gray-50 p-8 text-center">
            <p className="text-sm text-gray-400">
              Esta sección mostrará el ROI detallado cuando las campañas estén activas.
              Incluirá: costo por lead, tasa de conversión, revenue por campaña y comparativas.
            </p>
          </div>
        </SimpleCard>
      </div>
    </>
  )
}
