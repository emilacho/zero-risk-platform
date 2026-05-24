/**
 * /api/forms · Sprint 4 · CC#2
 *
 * GET  · list forms catalog (admin-gated) · supports ?is_active=true filter
 * POST · create form (admin-gated)
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const isActiveParam = url.searchParams.get('is_active')

  try {
    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('forms')
      .select('id, name, vertical, tally_form_id, description, schema_fields, is_active, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (isActiveParam === 'true') query = query.eq('is_active', true)
    if (isActiveParam === 'false') query = query.eq('is_active', false)

    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-FORMS-LIST', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ forms: data ?? [], count: (data ?? []).length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-FORMS-LIST-EXC', detail: msg },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  // Auth · requireAdmin is stricter than checkInternalKey (admin session) ·
  // lint-canon recognizes both markers post Sprint 8 D5.
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'bad_request', code: 'E-FORMS-JSON', detail: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json(
      { error: 'validation', code: 'E-FORMS-NAME', detail: 'name required' },
      { status: 400 },
    )
  }

  const insertRow = {
    name,
    vertical: typeof body.vertical === 'string' ? body.vertical : null,
    tally_form_id: typeof body.tally_form_id === 'string' ? body.tally_form_id : null,
    description: typeof body.description === 'string' ? body.description : null,
    schema_fields: Array.isArray(body.schema_fields) ? body.schema_fields : [],
    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('forms')
      .insert(insertRow)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-FORMS-INSERT', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ form: data }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-FORMS-INSERT-EXC', detail: msg },
      { status: 500 },
    )
  }
}
