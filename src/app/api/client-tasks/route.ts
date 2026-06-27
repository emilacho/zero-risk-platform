/**
 * POST /api/client-tasks
 *
 * Sprint 6 Track A2 · Stack V4 GHL-Out · replaces deprecated
 * `/api/ghl/add-task` consumed by Client Onboarding E2E v2 workflow.
 *
 * Persists a task row to `client_tasks` for downstream consumption by
 * Mission Control + Account Manager workflows.
 *
 * Body ·
 *   {
 *     client_id: string,           // REQUIRED
 *     title: string,               // REQUIRED · task summary
 *     description?: string,
 *     assigned_to?: string,        // agent slug or human (e.g., 'account-manager')
 *     priority?: 'low'|'normal'|'high'|'urgent',
 *     due_at?: ISO,
 *     metadata?: object,
 *   }
 *
 * Response · `{ ok, task: TaskRow }`
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

interface TaskBody {
  client_id?: string
  title?: string
  description?: string | null
  assigned_to?: string | null
  priority?: string
  due_at?: string | null
  metadata?: Record<string, unknown>
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })

  let body: TaskBody
  try {
    body = (await req.json()) as TaskBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  if (!body.client_id || !body.title) {
    return NextResponse.json(
      { ok: false, error: 'client_id_and_title_required' },
      { status: 400 },
    )
  }
  if (body.priority && !PRIORITIES.includes(body.priority as typeof PRIORITIES[number])) {
    return NextResponse.json(
      { ok: false, error: 'invalid_priority' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('client_tasks')
      .insert({
        client_id: body.client_id,
        title: body.title,
        description: body.description ?? null,
        // BUG4 fix (2026-06-27 · CC#4): `assigned_to` column does not exist in
        // `client_tasks` → 500. Removed from insert. And the date column is
        // `due_date`, not `due_at` → map body.due_at into the real column.
        priority: body.priority ?? 'normal',
        due_date: body.due_at ?? null,
        status: 'open',
        metadata: body.metadata ?? {},
      })
      .select()
      .single()
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, task: data }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
