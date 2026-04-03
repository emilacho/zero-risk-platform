import { Header } from '@/components/dashboard/Header'
import { Card } from '@/components/ui/Card'
import { SimpleCard } from '@/components/ui/Card'

// Demo data — will be replaced with real Supabase queries
const kpis = [
  { title: 'Leads Totales', value: 0, subtitle: 'Este mes', trend: undefined },
  { title: 'Campañas Activas', value: 0, subtitle: 'En ejecución', trend: undefined },
  { title: 'Gasto Total', value: '$0', subtitle: 'Este mes', trend: undefined },
  { title: 'Tasa de Conversión', value: '0%', subtitle: 'Lead → Cliente', trend: undefined },
]

const recentActivity = [
  { action: 'Plataforma desplegada en Vercel', time: 'Hace 1 hora', type: 'system' },
  { action: 'Schema V2 aplicado en Supabase', time: 'Hace 2 horas', type: 'system' },
  { action: 'n8n verificado y accesible', time: 'Hace 30 min', type: 'system' },
  { action: 'Dashboard creado', time: 'Ahora', type: 'system' },
]

const systemStatus = [
  { name: 'Vercel', status: 'Operativo', color: 'bg-green-500' },
  { name: 'Supabase', status: 'Operativo', color: 'bg-green-500' },
  { name: 'n8n', status: 'Trial (13 días)', color: 'bg-yellow-500' },
  { name: 'Composio', status: 'Pendiente', color: 'bg-gray-400' },
  { name: 'Mailgun', status: 'Pendiente', color: 'bg-gray-400' },
  { name: 'GoHighLevel', status: 'Pendiente', color: 'bg-gray-400' },
]

export default function DashboardPage() {
  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Vista general de Zero Risk Platform"
      />

      <div className="p-8 space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.title} {...kpi} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <SimpleCard title="Actividad Reciente">
            <div className="space-y-4">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-zero-risk-highlight flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{item.action}</p>
                    <p className="text-xs text-gray-400">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </SimpleCard>

          {/* System Status */}
          <SimpleCard title="Estado del Sistema">
            <div className="space-y-3">
              {systemStatus.map((service) => (
                <div key={service.name} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">{service.name}</span>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${service.color}`} />
                    <span className="text-xs text-gray-500">{service.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </SimpleCard>
        </div>

        {/* Architecture Overview */}
        <SimpleCard title="Arquitectura V2 — Progreso por Capa">
          <div className="space-y-4">
            {[
              { name: 'Infraestructura', progress: 100, color: 'bg-green-500' },
              { name: 'Capa 1: AI Agents + Ejecución', progress: 15, color: 'bg-blue-500' },
              { name: 'Capa 2: Orquestación (n8n)', progress: 5, color: 'bg-purple-500' },
              { name: 'Capa 3: Landing Pages', progress: 0, color: 'bg-yellow-500' },
              { name: 'Capa 4: Backend', progress: 50, color: 'bg-indigo-500' },
              { name: 'Capa 5: Command Center (JARVIS)', progress: 5, color: 'bg-pink-500' },
            ].map((layer) => (
              <div key={layer.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{layer.name}</span>
                  <span className="text-sm text-gray-500">{layer.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${layer.color} transition-all`}
                    style={{ width: `${layer.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SimpleCard>
      </div>
    </>
  )
}
