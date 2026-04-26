/**
 * POST /api/mc/inbox — crear mensaje
 * GET  /api/mc/inbox — listar mensajes
 * PATCH /api/mc/inbox/{id} — resolver (approve/reject/read)
 *
 * Reemplaza Mission Control /api/inbox con backend Supabase persistente.
 * Compatible con la interfaz de MC (mismos campos) para que n8n no cambie.
 *
 * Auth: ?masterPassword=zerorisk2026 (igual que MC)
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const MASTER_PASSWORD = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'

function checkAuth(request: Request): boolean {
  const url = new URL(request.url)
  return url.searchParams.get('masterPassword') === MASTER_PASSWORD
}

function generateId(prefix = 'msg'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { body = {} }

  const from_agent = String(body.from || 'unknown')
  const to_role = String(body.to || 'leader')
  const type = String(body.type || 'report')
  const task_id = body.taskId ? String(body.taskId) : null
  const subject = String(body.subject || '(sin asunto)')
  const msgBody = String(body.body || '')

  const supabase = getSupabaseAdmin()
  const id = generateId('msg')

  const { data, error } = await supabase
    .from('mission_control_inbox')
    .insert({
      id,
      from_agent,
      to_role,
      type,
      task_id,
      subject,
      body: msgBody,
      status: 'unread',
      source: 'platform',
    })
    .select('id, status, created_at')
    .single()

  if (error) {
    console.error('[mc/inbox POST] db error:', error.message)
    // Return MC-compatible response even on error (non-blocking)
    return NextResponse.json({ id, status: 'unread', createdAt: new Date().toISOString() })
  }

  // MC-compatible response shape
  return NextResponse.json({
    id: data.id,
    status: data.status,
    createdAt: data.created_at,
  })
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
  const type = url.searchParams.get('type')
  const status = url.searchParams.get('status')

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('mission_control_inbox')
    .select('id, from_agent, to_role, type, task_id, subject, body, status, read_at, decision, decided_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('type', type)
  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // MC-compatible response shape: { data: [...], messages: [...], meta: {} }
  const messages = (data || []).map(m => ({
    id: m.id,
    from: m.from_agent,
    to: m.to_role,
    type: m.type,
    taskId: m.task_id,
    subject: m.subject,
    body: m.body,
    status: m.status,
    createdAt: m.created_at,
    readAt: m.read_at,
  }))

  return NextResponse.json({
    data: messages,
    messages,
    meta: { count: messages.length, limit },
  })
}
