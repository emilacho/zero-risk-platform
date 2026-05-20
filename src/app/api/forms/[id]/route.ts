/**
 * /api/forms/[id] · Sprint 4 · CC#2
 *
 * GET    · form detail + recent submissions count
 * PATCH  · update fields (name · vertical · description · is_active · schema_fields)
 * DELETE · soft delete via is_active=false (preserve audit trail)
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'validation', code: 'E-FORMS-BAD-ID', detail: 'id must be uuid' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('forms')
      .select('id, name, vertical, tally_form_id, description, schema_fields, is_active, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-FORMS-GET', detail: error.message },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'not_found', code: 'E-FORMS-404', detail: `form ${id} not found` },
        { status: 404 },
      )
    }

    const { count } = await supabase
      .from('form_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', id)

    return NextResponse.json({ form: data, submissions_count: count ?? 0 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-FORMS-GET-EXC', detail: msg },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'validation', code: 'E-FORMS-BAD-ID', detail: 'id must be uuid' },
      { status: 400 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'bad_request', code: 'E-FORMS-JSON', detail: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') update.name = body.name.trim()
  if (typeof body.vertical === 'string' || body.vertical === null) update.vertical = body.vertical
  if (typeof body.description === 'string' || body.description === null) update.description = body.description
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active
  if (Array.isArray(body.schema_fields)) update.schema_fields = body.schema_fields
  if (typeof body.tally_form_id === 'string' || body.tally_form_id === null) update.tally_form_id = body.tally_form_id

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('forms')
      .update(update)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-FORMS-PATCH', detail: error.message },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'not_found', code: 'E-FORMS-404', detail: `form ${id} not found` },
        { status: 404 },
      )
    }

    return NextResponse.json({ form: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-FORMS-PATCH-EXC', detail: msg },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'validation', code: 'E-FORMS-BAD-ID', detail: 'id must be uuid' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('forms')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-FORMS-DELETE', detail: error.message },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'not_found', code: 'E-FORMS-404', detail: `form ${id} not found` },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true, deactivated: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-FORMS-DELETE-EXC', detail: msg },
      { status: 500 },
    )
  }
}
