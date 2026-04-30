import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { isValidUUID, pickFields, CAMPAIGN_FIELDS } from '@/lib/validation'
import { requireInternalApiKey } from '@/lib/auth-middleware'

// GET /api/campaigns/[id] — get single campaign
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireInternalApiKey(_request)
  if (!auth.ok) return auth.response

  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PATCH /api/campaigns/[id] — update campaign
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const supabase = getSupabase()
    const body = await request.json()
    const safeBody = pickFields(body, [...CAMPAIGN_FIELDS])

    if (Object.keys(safeBody).length === 0) {
      return NextResponse.json({ error: 'No hay campos válidos para actualizar' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update({ ...safeBody, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE /api/campaigns/[id] — delete campaign
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireInternalApiKey(_request)
  if (!auth.ok) return auth.response

  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
