import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { isValidUUID, isValidEmail, pickFields, LEAD_FIELDS } from '@/lib/validation'
import { requireInternalApiKey } from '@/lib/auth-middleware'
import { captureRouteError } from '@/lib/sentry-capture'

// GET /api/leads/[id] — get single lead
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
      .from('leads')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    captureRouteError(error, null, {
      route: '/api/leads/[id]',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PATCH /api/leads/[id] — update lead
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
    const safeBody = pickFields(body, [...LEAD_FIELDS])

    if (Object.keys(safeBody).length === 0) {
      return NextResponse.json({ error: 'No hay campos válidos para actualizar' }, { status: 400 })
    }

    // Validate email if provided
    if (safeBody.email && !isValidEmail(safeBody.email as string)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('leads')
      .update({ ...safeBody, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (error) {
    captureRouteError(error, null, {
      route: '/api/leads/[id]',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE /api/leads/[id] — delete lead
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
      .from('leads')
      .delete()
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    captureRouteError(error, null, {
      route: '/api/leads/[id]',
      source: 'route_handler',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
