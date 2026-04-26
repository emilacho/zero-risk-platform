/**
 * POST /api/mc/tasks — crear tarea
 * PUT  /api/mc/tasks — actualizar tarea (id en body)
 * GET  /api/mc/tasks — listar tareas (Eisenhower Matrix)
 *
 * Reemplaza Mission Control /api/tasks con backend Supabase persistente.
 * Compatible con la interfaz de MC para que mc-bridge.ts no cambie su lógica.
 *
 * Auth: ?masterPassword=zerorisk2026
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const MASTER_PASSWORD = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'

function checkAuth(request: Request): boolean {
  const url = new URL(request.url)
  return url.searchParams.get('masterPassword') === MASTER_PASSWORD
}

function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { body = {} }

  const supabase = getSupabaseAdmin()
  const id = generateId()

  // Extract pipeline_id from notes if present (mc-bridge embeds it there)
  let pipelineId: string | null = null
  let stepIndex: number | null = null
  const notesStr = String(body.notes || '')
  const pipelineMatch = notesStr.match(/pipeline_id:([a-f0-9-]+)/)
  const stepMatch = notesStr.match(/step_index:(\d+)/)
  if (pipelineMatch) pipelineId = pipelineMatch[1]
  if (stepMatch) stepIndex = parseInt(stepMatch[1], 10)

  const { data, error } = await supabase
    .from('mission_control_tasks')
    .insert({
      id,
      title: String(body.title || 'Sin título'),
      description: body.description ? String(body.description) : null,
      importance: String(body.importance || 'not-important'),
      urgency: String(body.urgency || 'not-urgent'),
      kanban: String(body.kanban || 'todo'),
      assigned_to: body.assignedTo ? String(body.assignedTo) : null,
      project_id: body.projectId ? String(body.projectId) : null,
      milestone_id: body.milestoneId ? String(body.milestoneId) : null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      notes: notesStr || null,
      estimated_minutes: body.estimatedMinutes ? Number(body.estimatedMinutes) : null,
      pipeline_id: pipelineId,
      step_index: stepIndex,
      source: 'pipeline',
    })
    .select('id, title, kanban, created_at')
    .single()

  if (error) {
    console.error('[mc/tasks POST] db error:', error.message)
    // Non-blocking: return MC-compatible stub even on error
    return NextResponse.json({ id, title: String(body.title || ''), kanban: 'todo', createdAt: new Date().toISOString() })
  }

  // MC-compatible response
  return NextResponse.json({
    id: data.id,
    title: data.title,
    kanban: data.kanban,
    createdAt: data.created_at,
  })
}

export async function PUT(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { body = {} }

  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('kanban' in body) updates.kanban = body.kanban
  if ('importance' in body) updates.importance = body.importance
  if ('urgency' in body) updates.urgency = body.urgency
  if ('assignedTo' in body) updates.assigned_to = body.assignedTo
  if ('notes' in body) updates.notes = body.notes
  if ('description' in body) updates.description = body.description
  if ('tags' in body) updates.tags = body.tags

  const { data, error } = await supabase
    .from('mission_control_tasks')
    .update(updates)
    .eq('id', id)
    .select('id, title, kanban, updated_at')
    .single()

  if (error) {
    console.error('[mc/tasks PUT] db error:', error.message)
    return NextResponse.json({ id, updated: true })
  }

  return NextResponse.json({
    id: data.id,
    title: data.title,
    kanban: data.kanban,
    updatedAt: data.updated_at,
  })
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
  const kanban = url.searchParams.get('kanban')
  const quadrant = url.searchParams.get('quadrant') // 'do' | 'schedule' | 'delegate' | 'eliminate'

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('mission_control_tasks')
    .select('id, title, description, importance, urgency, kanban, assigned_to, project_id, tags, notes, pipeline_id, step_index, created_at, updated_at')
    .is('deleted_at' as 'id', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (kanban) query = query.eq('kanban', kanban)
  if (quadrant === 'do') { query = query.eq('importance', 'important').eq('urgency', 'urgent') }
  else if (quadrant === 'schedule') { query = query.eq('importance', 'important').eq('urgency', 'not-urgent') }
  else if (quadrant === 'delegate') { query = query.eq('importance', 'not-important').eq('urgency', 'urgent') }
  else if (quadrant === 'eliminate') { query = query.eq('importance', 'not-important').eq('urgency', 'not-urgent') }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // MC-compatible shape + Eisenhower quadrant counts
  const tasks = data || []
  const quadrantCounts = {
    do: tasks.filter(t => t.importance === 'important' && t.urgency === 'urgent').length,
    schedule: tasks.filter(t => t.importance === 'important' && t.urgency === 'not-urgent').length,
    delegate: tasks.filter(t => t.importance === 'not-important' && t.urgency === 'urgent').length,
    eliminate: tasks.filter(t => t.importance === 'not-important' && t.urgency === 'not-urgent').length,
  }

  return NextResponse.json({
    data: tasks,
    tasks,
    meta: { count: tasks.length, limit, quadrant: quadrantCounts },
  })
}
