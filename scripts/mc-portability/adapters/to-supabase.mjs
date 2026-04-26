/**
 * Adapter: MC → Supabase (propio backend de Zero Risk)
 * Usa las tablas de schema_mc_migration.sql
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local
 *           Haber aplicado supabase/schema_mc_migration.sql primero
 */

export const META = {
  name: 'supabase',
  description: 'Importa en el propio Supabase del proyecto (mission_control_* tables)',
  requiresSchema: 'supabase/schema_mc_migration.sql',
}

export async function run(snapshot, { dryRun = true } = {}) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')

  async function upsert(table, rows) {
    if (!rows.length || dryRun) return rows.length
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
        'Prefer': 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    })
    if (!res.ok) throw new Error(`Supabase ${table}: ${await res.text()}`)
    return rows.length
  }

  const results = {}

  // Projects
  const projectRows = (snapshot.projects || []).map(p => ({
    id: p.id, name: p.name, description: p.description || null,
    status: p.status || 'active', color: p.color || '#6B7280',
    team_members: p.teamMembers || [], tags: p.tags || [],
    mc_id: p.id, source: 'import_mc',
    created_at: p.createdAt || new Date().toISOString(),
    updated_at: p.updatedAt || new Date().toISOString(),
  }))
  results.projects = await upsert('mission_control_projects', projectRows)

  // Tasks
  const taskRows = (snapshot.tasks || []).map(t => {
    const notes = String(t.notes || '')
    const pm = notes.match(/pipeline_id:([a-f0-9-]+)/)
    const sm = notes.match(/step_index:(\d+)/)
    return {
      id: t.id, title: t.title || 'Sin título',
      description: t.description || null,
      importance: t.importance || 'not-important',
      urgency: t.urgency || 'not-urgent',
      kanban: ({ 'not-started': 'todo', 'todo': 'todo', 'in-progress': 'in-progress', 'done': 'done' })[t.kanban] || 'todo',
      assigned_to: t.assignedTo || null, project_id: t.projectId || null,
      tags: t.tags || [], notes: notes || null,
      pipeline_id: pm ? pm[1] : null, step_index: sm ? parseInt(sm[1], 10) : null,
      source: 'import_mc', created_at: t.createdAt || new Date().toISOString(),
    }
  })
  results.tasks = await upsert('mission_control_tasks', taskRows)

  // Inbox
  const inboxRows = (snapshot.inbox || []).map(m => ({
    id: m.id, from_agent: m.from || 'unknown', to_role: m.to || 'leader',
    type: m.type || 'report', task_id: m.taskId || null,
    subject: m.subject || '(sin asunto)', body: m.body || '',
    status: m.status === 'read' ? 'read' : 'unread',
    read_at: m.readAt || null, source: 'import_mc',
    created_at: m.createdAt || new Date().toISOString(),
  }))
  results.inbox = await upsert('mission_control_inbox', inboxRows)

  return results
}
