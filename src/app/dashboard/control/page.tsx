'use client'

import { useState, useEffect, useCallback } from 'react'

const MC_PASSWORD = 'zerorisk2026'
const BASE = ''  // same-origin Vercel

// ─── Types ────────────────────────────────────────────────────────────────────
interface MCTask {
  id: string; title: string; description: string | null
  importance: string; urgency: string; kanban: string
  assigned_to: string | null; pipeline_id: string | null; created_at: string
}
interface MCMessage {
  id: string; from: string; type: string; subject: string
  body: string; status: string; createdAt: string
  decision?: string
}
interface MCStatus {
  supabase_mode: boolean; migration_status: string
  supabase: { tasks: number; inbox: number; projects: number }
  mission_control: { tasks: number | string; inbox: number | string }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Q(path: string) { return `${BASE}${path}?masterPassword=${MC_PASSWORD}` }

function QuadrantBadge({ importance, urgency }: { importance: string; urgency: string }) {
  const isImportant = importance === 'important'
  const isUrgent = urgency === 'urgent'
  const label = isImportant && isUrgent ? 'DO' : isImportant ? 'SCHEDULE' : isUrgent ? 'DELEGATE' : 'ELIMINATE'
  const colors: Record<string, string> = {
    DO: 'bg-red-100 text-red-700',
    SCHEDULE: 'bg-blue-100 text-blue-700',
    DELEGATE: 'bg-yellow-100 text-yellow-700',
    ELIMINATE: 'bg-gray-100 text-gray-500',
  }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${colors[label]}`}>{label}</span>
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ControlPage() {
  const [status, setStatus] = useState<MCStatus | null>(null)
  const [tasks, setTasks] = useState<MCTask[]>([])
  const [inbox, setInbox] = useState<MCMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [activeTab, setActiveTab] = useState<'inbox' | 'tasks' | 'status'>('inbox')
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [s, t, i] = await Promise.allSettled([
      fetch(Q('/api/mc/status')).then(r => r.json()),
      fetch(Q('/api/mc/tasks?limit=100')).then(r => r.json()),
      fetch(Q('/api/mc/inbox?limit=100')).then(r => r.json()),
    ])
    if (s.status === 'fulfilled') setStatus(s.value)
    if (t.status === 'fulfilled') setTasks(t.value.data || t.value.tasks || [])
    if (i.status === 'fulfilled') setInbox(i.value.data || i.value.messages || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const runMigration = async () => {
    setMigrating(true)
    await fetch(Q('/api/mc/status') + '&action=migrate', { method: 'POST' })
    await load()
    setMigrating(false)
  }

  const resolveMessage = async (id: string, decision: 'approved' | 'rejected') => {
    const notes = feedback[id] || ''
    await fetch(Q(`/api/mc/inbox/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, notes }),
    })
    setInbox(prev => prev.map(m => m.id === id ? { ...m, decision, status: 'resolved' } : m))
  }

  const pendingInbox = inbox.filter(m => m.status !== 'resolved')
  const approvalInbox = pendingInbox.filter(m => m.type === 'approval')
  const reportInbox = pendingInbox.filter(m => m.type !== 'approval')
  const doTasks = tasks.filter(t => t.importance === 'important' && t.urgency === 'urgent')
  const scheduleTasks = tasks.filter(t => t.importance === 'important' && t.urgency === 'not-urgent')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mission Control</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {status?.supabase_mode
              ? '✅ Supabase mode — persistente'
              : '⚠️ MC Railway mode — activar MC_SUPABASE_MODE=true para persistencia'}
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >Actualizar</button>
      </div>

      {/* Migration Banner */}
      {status && status.migration_status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-amber-900">Migración pendiente</p>
            <p className="text-sm text-amber-700">
              MC tiene {status.mission_control.tasks} tareas y {status.mission_control.inbox} mensajes.
              Supabase tiene {status.supabase.tasks} + {status.supabase.inbox}.
            </p>
          </div>
          <button
            onClick={runMigration}
            disabled={migrating}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {migrating ? 'Migrando...' : 'Migrar ahora'}
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Inbox pendiente', value: pendingInbox.length, color: 'text-blue-600' },
          { label: 'Aprobaciones', value: approvalInbox.length, color: 'text-orange-600' },
          { label: 'DO ahora', value: doTasks.length, color: 'text-red-600' },
          { label: 'Tasks total', value: tasks.length, color: 'text-gray-700' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(['inbox', 'tasks', 'status'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab === 'inbox' ? `Inbox (${pendingInbox.length})` : tab === 'tasks' ? `Tasks (${tasks.length})` : 'Estado migración'}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {/* Inbox Tab */}
      {activeTab === 'inbox' && !loading && (
        <div className="space-y-3">
          {approvalInbox.length > 0 && (
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
              Requieren aprobación ({approvalInbox.length})
            </p>
          )}
          {pendingInbox.length === 0 && (
            <p className="text-sm text-gray-400 py-8 text-center">Inbox vacío ✓</p>
          )}
          {pendingInbox.map(msg => (
            <div
              key={msg.id}
              className={`border rounded-xl p-4 space-y-3 ${msg.type === 'approval' ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${msg.type === 'approval' ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>
                      {msg.type}
                    </span>
                    <span className="text-xs text-gray-400">{msg.from}</span>
                    <span className="text-xs text-gray-300">{new Date(msg.createdAt).toLocaleString('es-EC')}</span>
                  </div>
                  <p className="font-medium text-gray-900 mt-1 text-sm">{msg.subject}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{msg.body}</p>
                </div>
              </div>

              {msg.type === 'approval' && (
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Feedback opcional (requerido para rechazar)..."
                    className="w-full text-xs border border-gray-200 rounded-lg p-2 resize-none"
                    value={feedback[msg.id] || ''}
                    onChange={e => setFeedback(prev => ({ ...prev, [msg.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveMessage(msg.id, 'approved')}
                      className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg"
                    >✓ Aprobar</button>
                    <button
                      onClick={() => resolveMessage(msg.id, 'rejected')}
                      className="flex-1 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg"
                    >✗ Rechazar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {reportInbox.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4">
                Reportes ({reportInbox.length})
              </p>
              {reportInbox.map(msg => (
                <div key={msg.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{msg.from}</span>
                    <span className="text-xs font-medium text-gray-700">{msg.subject}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Tasks Tab — Eisenhower Matrix */}
      {activeTab === 'tasks' && !loading && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: '🔴 DO — Importante + Urgente', items: doTasks },
            { label: '🔵 SCHEDULE — Importante + No Urgente', items: scheduleTasks },
            { label: '🟡 DELEGATE — No Importante + Urgente', items: tasks.filter(t => t.importance === 'not-important' && t.urgency === 'urgent') },
            { label: '⚫ ELIMINATE — No Importante + No Urgente', items: tasks.filter(t => t.importance === 'not-important' && t.urgency === 'not-urgent') },
          ].map(q => (
            <div key={q.label} className="border border-gray-200 rounded-xl p-4 space-y-2 bg-white">
              <p className="text-xs font-semibold text-gray-600">{q.label} ({q.items.length})</p>
              {q.items.length === 0 && <p className="text-xs text-gray-300">Vacío</p>}
              {q.items.slice(0, 5).map(task => (
                <div key={task.id} className="py-1 border-b border-gray-50 last:border-0">
                  <p className="text-xs text-gray-700 font-medium truncate">{task.title}</p>
                  {task.assigned_to && <p className="text-xs text-gray-400">{task.assigned_to}</p>}
                </div>
              ))}
              {q.items.length > 5 && <p className="text-xs text-gray-400">+{q.items.length - 5} más</p>}
            </div>
          ))}
        </div>
      )}

      {/* Status Tab */}
      {activeTab === 'status' && status && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-2">
              <p className="text-sm font-semibold text-gray-700">Supabase (nuevo)</p>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Tasks: <strong>{status.supabase.tasks}</strong></p>
                <p>Inbox: <strong>{status.supabase.inbox}</strong></p>
                <p>Projects: <strong>{status.supabase.projects}</strong></p>
              </div>
              <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${status.supabase_mode ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {status.supabase_mode ? 'ACTIVO' : 'En espera'}
              </span>
            </div>
            <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-2">
              <p className="text-sm font-semibold text-gray-700">Mission Control (viejo)</p>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Tasks: <strong>{status.mission_control.tasks}</strong></p>
                <p>Inbox: <strong>{status.mission_control.inbox}</strong></p>
              </div>
              <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${status.mission_control.tasks === 'offline' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                {status.mission_control.tasks === 'offline' ? 'OFFLINE' : 'Railway'}
              </span>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
            <p className="text-sm font-semibold text-gray-700">Pasos de activación</p>
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-2"><span className="font-bold text-gray-400">1.</span> Aplicar <code className="bg-gray-100 px-1 rounded">supabase/schema_mc_migration.sql</code> en Supabase SQL Editor</li>
              <li className="flex gap-2"><span className="font-bold text-gray-400">2.</span> Click en "Migrar ahora" arriba (o <code className="bg-gray-100 px-1 rounded">POST /api/mc/status?action=migrate</code>)</li>
              <li className="flex gap-2"><span className="font-bold text-gray-400">3.</span> Agregar <code className="bg-gray-100 px-1 rounded">MC_SUPABASE_MODE=true</code> en Railway → Vercel service env vars</li>
              <li className="flex gap-2"><span className="font-bold text-gray-400">4.</span> Opcional: decommission MC de Railway (~$5/mes ahorrados)</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
