import { Header } from '@/components/dashboard/Header'
import { TaskRunner } from '@/components/command-center/TaskRunner'

export const metadata = {
  title: 'JARVIS — Zero Risk Command Center',
}

export default function JarvisPage() {
  return (
    <>
      <Header
        title="JARVIS — Command Center"
        subtitle="Ejecuta tareas de la agencia agéntica en lenguaje natural"
      />

      <div className="p-8">
        <div className="mx-auto max-w-4xl">
          {/* Pipeline indicator */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Capa 5 · Command Center
                </p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">
                  Agent Pipeline E2E
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  RUFLO (clasifica) → Jefe Marketing (delega) → Empleados
                  (ejecutan) → Jefe Marketing (consolida)
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <span className="text-xs font-medium text-green-700">
                  Pipeline operativo
                </span>
              </div>
            </div>
          </div>

          <TaskRunner />
        </div>
      </div>
    </>
  )
}
