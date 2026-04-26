/**
 * GET /api/mc/status — estado de la migración MC → Supabase
 * POST /api/mc/status?action=migrate — ejecuta la migración in-process
 *
 * Auth: ?masterPassword=zerorisk2026
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const MASTER_PASSWORD = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'
const MC_BASE_URL = process.env.MC_BASE_URL || 'https://zero-risk-mission-control-production.up.railway.app'

function checkAuth(request: Request): boolean {
  const url = new URL(request.url)
  return url.searchParams.get('masterPassword') === MASTER_PASSWORD
}

async function countTable(supabase: ReturnType<typeof getSupabaseAdmin>, table: string): Promise<number> {
  const { count } = await supabase.from(table as 'clients').select('*', { count: 'exact', head: true })
  return count || 0
}

async function mcCount(path: string): Promise<number> {
  try {
    const res = await fetch(`${MC_BASE_URL}${path}?masterPassword=${MASTER_PASSWORD}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return -1
    const data = await res.json()
    const arr = Array.isArray(data) ? data : (data.data || data.tasks || data.messages || data.items || [])
    return arr.length
  } catch {
    return -1
  }
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const [sbTasks, sbInbox, sbProjects, mcTasks, mcInbox] = await Promise.all([
    countTable(supabase, 'mission_control_tasks'),
    countTable(supabase, 'mission_control_inbox'),
    countTable(supabase, 'mission_control_projects'),
    mcCount('/api/tasks'),
    mcCount('/api/inbox'),
  ])

  const supabaseMode = process.env.MC_SUPABASE_MODE === 'true'
  const migrationDone = sbTasks > 0 || sbInbox > 0

  return NextResponse.json({
    supabase_mode: supabaseMode,
    migration_status: migrationDone ? 'done' : 'pending',
    supabase: {
      tasks: sbTasks,
      inbox: sbInbox,
      projects: sbProjects,
    },
    mission_control: {
      tasks: mcTasks === -1 ? 'offline' : mcTasks,
      inbox: mcInbox === -1 ? 'offline' : mcInbox,
      url: MC_BASE_URL,
    },
    next_steps: !supabaseMode
      ? ['Apply supabase/schema_mc_migration.sql', 'node scripts/migrate-mc.mjs --execute', 'Set MC_SUPABASE_MODE=true in Railway']
      : migrationDone
        ? ['Migration complete — MC can be decommissioned from Railway']
        : ['Run migration: POST /api/mc/status?action=migrate&masterPassword=...'],
    endpoints: {
      inbox_list: '/api/mc/inbox?masterPassword=...',
      inbox_post: 'POST /api/mc/inbox?masterPassword=...',
      inbox_resolve: 'PATCH /api/mc/inbox/{id}?masterPassword=...',
      tasks_list: '/api/mc/tasks?masterPassword=...',
      tasks_create: 'POST /api/mc/tasks?masterPassword=...',
      tasks_update: 'PUT /api/mc/tasks?masterPassword=...',
      eisenhower_do: '/api/mc/tasks?quadrant=do&masterPassword=...',
    },
  })
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (action !== 'migrate') {
    return NextResponse.json({ error: 'Unknown action. Use ?action=migrate' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const results: Record<string, unknown> = { started_at: new Date().toISOString() }

  // ── Migrate tasks ──────────────────────────────────────────────────────────
  try {
    const tasksRes = await fetch(`${MC_BASE_URL}/api/tasks?masterPassword=${MASTER_PASSWORD}`, { signal: AbortSignal.timeout(10000) })
    const tasksData = await tasksRes.json()
    const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.data || tasksData.tasks || [])

    if (tasks.length) {
      const rows = tasks.map((t: Record<string, unknown>) => {
        const notesStr = String(t.notes || '')
        const pm = notesStr.match(/pipeline_id:([a-f0-9-]+)/)
        const sm = notesStr.match(/step_index:(\d+)/)
        return {
          id: t.id,
          title: t.title || 'Sin título',
          description: t.description || null,
          importance: t.importance || 'not-important',
          urgency: t.urgency || 'not-urgent',
          kanban: t.kanban || 'todo',
          assigned_to: t.assignedTo || null,
          project_id: t.projectId || null,
          tags: t.tags || [],
          notes: notesStr || null,
          pipeline_id: pm ? pm[1] : null,
          step_index: sm ? parseInt(sm[1], 10) : null,
          source: 'import_mc',
          created_at: t.createdAt || new Date().toISOString(),
        }
      })
      const { error } = await supabase.from('mission_control_tasks').upsert(rows, { onConflict: 'id' })
      results.tasks = error ? `error: ${error.message}` : `${rows.length} imported`
    } else {
      results.tasks = '0 tasks in MC'
    }
  } catch (e) {
    results.tasks = `error: ${e instanceof Error ? e.message : 'fetch failed'}`
  }

  // ── Migrate inbox ──────────────────────────────────────────────────────────
  try {
    const inboxRes = await fetch(`${MC_BASE_URL}/api/inbox?masterPassword=${MASTER_PASSWORD}`, { signal: AbortSignal.timeout(10000) })
    const inboxData = await inboxRes.json()
    const messages = Array.isArray(inboxData) ? inboxData : (inboxData.data || inboxData.messages || [])

    if (messages.length) {
      const rows = messages.map((m: Record<string, unknown>) => ({
        id: m.id,
        from_agent: m.from || 'unknown',
        to_role: m.to || 'leader',
        type: m.type || 'report',
        task_id: m.taskId || null,
        subject: m.subject || '(sin asunto)',
        body: m.body || '',
        status: m.status === 'read' ? 'read' : 'unread',
        read_at: m.readAt || null,
        source: 'import_mc',
        created_at: m.createdAt || new Date().toISOString(),
      }))
      const { error } = await supabase.from('mission_control_inbox').upsert(rows, { onConflict: 'id' })
      results.inbox = error ? `error: ${error.message}` : `${rows.length} imported`
    } else {
      results.inbox = '0 messages in MC'
    }
  } catch (e) {
    results.inbox = `error: ${e instanceof Error ? e.message : 'fetch failed'}`
  }

  results.completed_at = new Date().toISOString()
  results.next = 'Set MC_SUPABASE_MODE=true in Railway env vars and redeploy'

  return NextResponse.json(results)
}
